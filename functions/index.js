// RewardKidz — Cloud Functions
// Déclenche une notification push FCM quand le score d'un enfant change.

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onRequest }         = require('firebase-functions/v2/https');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore }      = require('firebase-admin/firestore');
const { getMessaging }      = require('firebase-admin/messaging');

initializeApp();

const APP_URL = 'https://rewardkidz-4fe68.web.app';

// ── Widget Scriptable — API publique sécurisée par token ───────────────────
exports.widgetData = onRequest({ cors: false, region: 'us-central1' }, async (req, res) => {
  const token = req.query.token;
  if (!token || !/^[0-9a-f]{32}$/.test(token))
    return res.status(400).json({ error: 'Token invalide' });

  try {
    const db = getFirestore();
    const tokenSnap = await db.collection('widgetTokens').doc(token).get();
    if (!tokenSnap.exists)
      return res.status(404).json({ error: 'Token introuvable' });

    const { familyId, memberId, childName } = tokenSnap.data();

    const [scoreSnap, histSnap] = await Promise.all([
      db.collection('families').doc(familyId).collection('scores').doc(memberId).get(),
      db.collection('families').doc(familyId)
        .collection('scores').doc(memberId)
        .collection('history')
        .orderBy('date', 'desc').limit(30).get()
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const score = scoreSnap.exists
      ? scoreSnap.data()
      : { points: 0, validated: false, ignored: false, date: today };

    const history = histSnap.docs.map(d => {
      const data = d.data();
      return {
        date:      data.date,
        points:    data.points    ?? 0,
        validated: !!data.validated,
        ignored:   !!data.ignored
      };
    });

    res.json({
      childName,
      points:    score.points    ?? 0,
      validated: !!score.validated,
      ignored:   !!score.ignored,
      date:      score.date || today,
      history
    });
  } catch (e) {
    console.error('[widgetData]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

exports.onScoreChange = onDocumentWritten(
  'families/{familyId}/scores/{memberId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();
    if (!after) return; // document supprimé

    const { familyId, memberId } = event.params;

    // ── Déterminer le type de changement ───────────────────
    let title, body;

    if (!before?.validated && after.validated) {
      title = '✅ Journée validée !';
      body  = `Ta journée est validée avec ${after.points}/5 étoile${after.points !== 1 ? 's' : ''}. Bravo !`;
    } else if (!before?.ignored && after.ignored) {
      title = '📋 Journée enregistrée';
      body  = "Ta journée d'aujourd'hui a été enregistrée par un parent.";
    } else if (before?.points !== undefined && before.points !== after.points) {
      const diff = after.points - before.points;
      const sign = diff > 0 ? `+${diff}` : String(diff);
      title = `⭐ Score ${sign} !`;
      body  = `Tu as maintenant ${after.points}/5 étoile${after.points !== 1 ? 's' : ''} aujourd'hui.`;
    } else {
      return; // Aucun changement pertinent pour l'enfant
    }

    // ── Récupérer le token FCM du membre ───────────────────
    const memberSnap = await getFirestore()
      .doc(`families/${familyId}/members/${memberId}`)
      .get();

    const fcmToken = memberSnap.data()?.fcmToken;
    if (!fcmToken) return; // L'enfant n'a pas encore activé les notifs

    // ── Envoyer la notification push ───────────────────────
    try {
      await getMessaging().send({
        token: fcmToken,
        notification: { title, body },
        webpush: {
          notification: {
            title,
            body,
            icon:     `${APP_URL}/icon-192.png`,
            badge:    `${APP_URL}/icon-192.png`,
            tag:      'rewardkidz-score',
            renotify: true,
            vibrate:  [200, 100, 200],
          },
          fcmOptions: { link: APP_URL },
        },
      });
    } catch (e) {
      // Token invalide ou révoqué — nettoyer pour éviter les envois futurs inutiles
      if (e.code === 'messaging/registration-token-not-registered') {
        await getFirestore()
          .doc(`families/${familyId}/members/${memberId}`)
          .update({ fcmToken: null });
      } else {
        console.error('[FCM send]', e);
      }
    }
  }
);
