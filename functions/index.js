// RewardKidz — Cloud Functions
// Déclenche une notification push FCM quand le score d'un enfant change.

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore }      = require('firebase-admin/firestore');
const { getMessaging }      = require('firebase-admin/messaging');

initializeApp();

const APP_URL = 'https://rewardkidz-4fe68.web.app';

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
