// ============================================================
//  RewardKidz - Widget Scriptable
//
//  Parametre du widget (obligatoire) :
//    URL generee depuis l'app RewardKidz > detail enfant > Widget Scriptable
//    Exemple : https://rewardkidz-4fe68.web.app/api/widget?token=abc123...
//
//  Tailles :
//    Small (defaut)         -> arc aiguille  |  pause = icone pause
//    Small param="rainbow"  -> arc en ciel   |  inchange
//    Medium                 -> barres        |  pause / valide
//    Large                  -> barres + hist |  pause / valide
//
//  Etats :
//    Normal   -> points = 1-5
//    Pause    -> ignored = true  (sentinelle PAUSE_VAL = -1)
//    Valide   -> validated = true
//
//  Echelle : 0-5 points (RewardKidz)
//    Affichage : "/5"
//    Interne   : points * 2  -> 0-10 pour les jauges visuelles
// ============================================================

var DEFAULT_VAL  = 8;   // valeur interne (echelle 0-10) si lecture impossible
var PAUSE_VAL    = -1;  // sentinelle pause

// ============================================================
//  SCHEMA COULEURS : dark / light
// ============================================================
var isDark = Device.isUsingDarkAppearance();

function makeBgGradient() {
  var g = new LinearGradient();
  if (isDark) {
    g.colors    = [new Color("#1c1c2a"), new Color("#0a0a10")];
    g.locations = [0, 1];
  } else {
    g.colors    = [new Color("#ffffff"), new Color("#ededf3")];
    g.locations = [0, 1];
  }
  return g;
}

var S = isDark ? {
  title       : new Color("#ffffff"),
  subtitle    : new Color("#636366"),
  dateText    : new Color("#48484a"),
  denom       : new Color("#2c2c2e"),
  muted       : new Color("#3a3a3c"),
  sectionLbl  : new Color("#3a3a3c"),
  statsBg     : new Color("#111116"),
  statsSep    : new Color("#2c2c2e"),
  pauseBg     : new Color("#0e0e14"),
  pauseText   : new Color("#3a3a3c"),
  pauseIcon   : new Color("#2c2c2e"),
  pauseBar    : new Color("#252530"),
  gaugeInact  : new Color("#1e1e26"),
  gaugeValDim : new Color("#111118"),
  histDay     : new Color("#48484a"),
  badgeColor  : new Color("#4a8a4a"),
} : {
  title       : new Color("#000000"),
  subtitle    : new Color("#8e8e93"),
  dateText    : new Color("#8e8e93"),
  denom       : new Color("#c7c7cc"),
  muted       : new Color("#aeaeb2"),
  sectionLbl  : new Color("#aeaeb2"),
  statsBg     : new Color("#f2f2f7"),
  statsSep    : new Color("#d1d1d6"),
  pauseBg     : new Color("#f2f2f7"),
  pauseText   : new Color("#8e8e93"),
  pauseIcon   : new Color("#c7c7cc"),
  pauseBar    : new Color("#d1d1d6"),
  gaugeInact  : new Color("#e5e5ea"),
  gaugeValDim : new Color("#f0f0f5"),
  histDay     : new Color("#8e8e93"),
  badgeColor  : new Color("#34a050"),
};

// --- PALETTE STANDARD (echelle interne 0-10) ---
function segColor(n) {
  var p = {
    1:"#1a0000", 2:"#8b0000", 3:"#cc2200", 4:"#e03800",
    5:"#e07000", 6:"#e0b000", 7:"#c8c800", 8:"#90c820",
    9:"#40c040", 10:"#00bb00"
  };
  return new Color(p[n] || "#333");
}
function accentColor(v10) {
  if (v10 <= 2)  return new Color("#cc0000");
  if (v10 <= 5)  return new Color("#e07000");
  if (v10 <= 8)  return new Color("#a0cc00");
  return new Color("#00bb00");
}
// Label humeur adapte a l'echelle 0-5 (indice = points raw)
function moodLabel(raw) {
  var l = ["", "Difficile", "Moyen", "Bien", "Tres bien", "Parfait !"];
  return l[Math.max(0, Math.min(5, raw))] || "";
}

// --- PALETTE RAINBOW ---
var RW = ["#FF3B30","#FF9500","#FFCC02","#34C759","#007AFF","#5856D6","#AF52DE"];
var RD = ["#2a0000","#2a1500","#2a2100","#00280a","#000e28","#0b0b26","#160826"];
function arcsLit(v10) { return Math.min(7, Math.max(0, Math.round((v10 / 10) * 7))); }
function rainbowAccent(v10) { var n = arcsLit(v10); return n > 0 ? new Color(RW[n-1]) : new Color("#555"); }

// ============================================================
//  LECTURE JSON depuis l'URL RewardKidz
// ============================================================
async function fetchWidgetData(url) {
  try {
    var req  = new Request(url);
    var json = await req.loadJSON();
    var raw  = json.points ?? 0;  // 0-5
    var v10  = Math.min(10, Math.max(0, raw * 2));  // 0-10 interne

    if (json.ignored) {
      return { value: PAUSE_VAL, validScore: null, history: json.history || [], childName: json.childName || "RewardKidz", rawPoints: raw };
    }
    var validScore = json.validated ? v10 : null;
    return { value: v10, validScore, history: json.history || [], childName: json.childName || "RewardKidz", rawPoints: raw };
  } catch (e) {
    return { value: DEFAULT_VAL, validScore: null, history: [], childName: "RewardKidz", rawPoints: 4 };
  }
}

// Convertit l'historique JSON en tableau {date, value (0-10), raw (0-5)}
// Les jours ignores sont exclus des statistiques
function parseHistoryJSON(arr) {
  if (!arr || !arr.length) return [];
  return arr
    .filter(function(e) { return !e.ignored && typeof e.points === "number"; })
    .map(function(e) { return { date: e.date, value: Math.min(10, e.points * 2), raw: e.points }; })
    .reverse();
}
function getLast7(h)  { return h.slice(0, 7).reverse(); }
function getAvg30(h) {
  var s = h.slice(0, 30);
  if (!s.length) return null;
  // Retourne la moyenne en echelle 0-5
  return Math.round(s.reduce(function(a, b) { return a + b.raw; }, 0) / s.length * 10) / 10;
}
function getTrend(h) {
  if (h.length < 7) return "stable";
  var a1 = h.slice(0, 7).reduce(function(a, b)  { return a + b.value; }, 0) / 7;
  var p7 = h.slice(7, 14);
  if (!p7.length) return "stable";
  var a2 = p7.reduce(function(a, b) { return a + b.value; }, 0) / p7.length;
  if (a1 - a2 >  0.8) return "up";
  if (a1 - a2 < -0.8) return "down";
  return "stable";
}

// ============================================================
//  DESSIN : icone PAUSE
// ============================================================
function drawPauseIcon(size) {
  var ctx = new DrawContext();
  ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  var barW = size*0.15, barH = size*0.40, gap = size*0.12;
  var totalW = barW*2+gap, x1 = (size-totalW)/2, x2 = x1+barW+gap, y = (size-barH)/2, r = barW*0.35;
  var cr = size*0.38, cx = size/2, cy = size/2;
  ctx.setFillColor(S.pauseBar);
  ctx.fillEllipse(new Rect(cx-cr, cy-cr, cr*2, cr*2));
  ctx.setFillColor(S.pauseIcon);
  var p1 = new Path(); p1.addRoundedRect(new Rect(x1, y, barW, barH), r, r); ctx.addPath(p1); ctx.fillPath();
  var p2 = new Path(); p2.addRoundedRect(new Rect(x2, y, barW, barH), r, r); ctx.addPath(p2); ctx.fillPath();
  return ctx.getImage();
}

// ============================================================
//  DESSIN : jauge barres (valeur interne 0-10, 10 segments)
// ============================================================
function drawBarGauge(value, width, height, validatedScore) {
  var ctx = new DrawContext();
  ctx.size = new Size(width, height); ctx.opaque = false; ctx.respectScreenScale = true;
  var gap = 4, r = 5, sw = (width - gap*9) / 10;
  for (var i = 1; i <= 10; i++) {
    var x = (i-1) * (sw+gap);
    var col;
    if (validatedScore != null) {
      col = (i === validatedScore) ? segColor(i) : S.gaugeValDim;
    } else {
      col = (i <= value) ? segColor(i) : S.gaugeInact;
    }
    ctx.setFillColor(col);
    var path = new Path();
    path.addRoundedRect(new Rect(x, 0, sw, height), i === 1 ? r : 2, i === 10 ? r : 2);
    ctx.addPath(path); ctx.fillPath();
  }
  return ctx.getImage();
}

// ============================================================
//  DESSIN : arc standard
// ============================================================
function drawStdArc(value, size) {
  var ctx = new DrawContext();
  ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  var cx = size/2, cy = size/2 + size*0.08, R = size*0.38, lw = size*0.065;
  var startDeg = 210, sweep = 300, segSw = sweep/10, gapA = 0.025;
  for (var i = 1; i <= 10; i++) {
    var s = (startDeg + (i-1)*segSw) * Math.PI/180 + gapA/2;
    var e = (startDeg +  i   *segSw) * Math.PI/180 - gapA/2;
    ctx.setStrokeColor(i <= value ? segColor(i) : S.gaugeInact);
    ctx.setLineWidth(lw);
    var steps = 14, path = new Path();
    for (var k = 0; k <= steps; k++) {
      var a = s + (e-s) * (k/steps);
      if (k === 0) path.move(new Point(cx + Math.cos(a)*R, cy + Math.sin(a)*R));
      else         path.addLine(new Point(cx + Math.cos(a)*R, cy + Math.sin(a)*R));
    }
    ctx.addPath(path); ctx.strokePath();
  }
  var na = (startDeg + (value - 0.5)*segSw) * Math.PI/180;
  var needleAlpha = isDark ? 0.9 : 0.6;
  ctx.setStrokeColor(new Color(isDark ? "#ffffff" : "#000000", needleAlpha));
  ctx.setLineWidth(size*0.022);
  var np = new Path(); np.move(new Point(cx, cy));
  np.addLine(new Point(cx + Math.cos(na)*R*0.74, cy + Math.sin(na)*R*0.74));
  ctx.addPath(np); ctx.strokePath();
  var pr = size*0.032; ctx.setFillColor(accentColor(value));
  ctx.fillEllipse(new Rect(cx-pr, cy-pr, pr*2, pr*2));
  return ctx.getImage();
}

function drawStdArcValidated(validatedScore, size) {
  var ctx = new DrawContext();
  ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  var cx = size/2, cy = size/2 + size*0.08, R = size*0.38, lw = size*0.065;
  var startDeg = 210, sweep = 300, segSw = sweep/10, gapA = 0.025;
  for (var i = 1; i <= 10; i++) {
    var s = (startDeg + (i-1)*segSw) * Math.PI/180 + gapA/2;
    var e = (startDeg +  i   *segSw) * Math.PI/180 - gapA/2;
    ctx.setStrokeColor(i === validatedScore ? segColor(i) : S.gaugeValDim);
    ctx.setLineWidth(lw);
    var steps = 14, path = new Path();
    for (var k = 0; k <= steps; k++) {
      var a = s + (e-s) * (k/steps);
      if (k === 0) path.move(new Point(cx + Math.cos(a)*R, cy + Math.sin(a)*R));
      else         path.addLine(new Point(cx + Math.cos(a)*R, cy + Math.sin(a)*R));
    }
    ctx.addPath(path); ctx.strokePath();
  }
  var na = (startDeg + (validatedScore - 0.5)*segSw) * Math.PI/180;
  ctx.setStrokeColor(new Color(isDark ? "#ffffff" : "#000000", isDark ? 0.75 : 0.45));
  ctx.setLineWidth(size*0.022);
  var np = new Path(); np.move(new Point(cx, cy));
  np.addLine(new Point(cx + Math.cos(na)*R*0.74, cy + Math.sin(na)*R*0.74));
  ctx.addPath(np); ctx.strokePath();
  ctx.setFillColor(accentColor(validatedScore));
  var pr = size*0.032;
  ctx.fillEllipse(new Rect(cx-pr, cy-pr, pr*2, pr*2));
  return ctx.getImage();
}

// ============================================================
//  DESSIN : arc rainbow
// ============================================================
function makeArcPath(cx, cy, r, steps) {
  var path = new Path();
  for (var s = 0; s <= steps; s++) {
    var a = Math.PI + Math.PI * (s/steps);
    if (s === 0) path.move(new Point(cx + Math.cos(a)*r, cy + Math.sin(a)*r));
    else         path.addLine(new Point(cx + Math.cos(a)*r, cy + Math.sin(a)*r));
  }
  return path;
}
function drawRainbowArc(value, W, H) {
  var ctx = new DrawContext();
  ctx.size = new Size(W, H); ctx.opaque = false; ctx.respectScreenScale = true;
  var cx = W/2, cy = H, rMax = W*0.44, rMin = W*0.12;
  var rStep = (rMax-rMin)/6, lw = rStep*0.64, lit = arcsLit(value);
  for (var i = 0; i <= 6; i++) {
    var r = rMax - i*rStep, isLit = i < lit, col = isLit ? RW[i] : RD[i];
    if (isLit) {
      var glows = [{a:0.08,e:14},{a:0.16,e:8},{a:0.28,e:4}];
      for (var g = 0; g < glows.length; g++) {
        ctx.setStrokeColor(new Color(col, glows[g].a)); ctx.setLineWidth(lw + glows[g].e);
        ctx.addPath(makeArcPath(cx, cy, r, 48)); ctx.strokePath();
      }
    }
    ctx.setStrokeColor(new Color(col)); ctx.setLineWidth(lw);
    ctx.addPath(makeArcPath(cx, cy, r, 48)); ctx.strokePath();
  }
  return ctx.getImage();
}

// ============================================================
//  DESSIN : graphe 7 jours
// ============================================================
function drawHistory7(last7, width, height) {
  var ctx = new DrawContext();
  ctx.size = new Size(width, height); ctx.opaque = false; ctx.respectScreenScale = true;
  var n = last7.length; if (!n) return ctx.getImage();
  var barW = (width - (n-1)*4) / n, maxH = height*0.76;
  for (var i = 0; i < n; i++) {
    var v = last7[i].value, bH = (v/10)*maxH, x = i*(barW+4), y = height - bH - 14;
    ctx.setFillColor(segColor(Math.max(1, Math.min(10, v))));
    var p = new Path(); p.addRoundedRect(new Rect(x, y, barW, bH), 3, 3); ctx.addPath(p); ctx.fillPath();
    // Afficher la valeur 0-5 sur la barre
    ctx.setTextColor(accentColor(v)); ctx.setFont(Font.boldSystemFont(9));
    ctx.drawTextInRect(String(last7[i].raw), new Rect(x, y-13, barW, 12));
    var d  = new Date(last7[i].date + "T12:00:00");
    var ds = d.toLocaleDateString("fr-FR", {weekday:"short"}).substring(0, 2);
    ctx.setTextColor(S.histDay); ctx.setFont(Font.systemFont(9));
    ctx.drawTextInRect(ds, new Rect(x, height-13, barW, 13));
  }
  return ctx.getImage();
}

// ============================================================
//  WIDGET SMALL STANDARD
// ============================================================
async function buildSmall(value, validatedScore, rawPoints) {
  var w = new ListWidget();
  w.backgroundGradient = makeBgGradient();
  w.setPadding(12, 12, 10, 12);

  if (value === PAUSE_VAL) {
    w.addSpacer();
    var pi = w.addImage(drawPauseIcon(80));
    pi.imageSize = new Size(80, 80); pi.resizable = false; pi.centerAlignImage();
    w.addSpacer();
  } else if (validatedScore !== null) {
    var img = w.addImage(drawStdArcValidated(validatedScore, 132));
    img.imageSize = new Size(132, 132); img.resizable = false; img.centerAlignImage();
    w.addSpacer(-34);
    var row = w.addStack();
    row.layoutHorizontally(); row.centerAlignContent(); row.addSpacer();
    var vt = row.addText(String(Math.round(validatedScore / 2)));
    vt.textColor = accentColor(validatedScore); vt.font = Font.boldSystemFont(22);
    var dt = row.addText("/5");
    dt.textColor = S.denom; dt.font = Font.boldSystemFont(13);
    row.addSpacer();
  } else {
    var img = w.addImage(drawStdArc(value, 132));
    img.imageSize = new Size(132, 132); img.resizable = false; img.centerAlignImage();
    w.addSpacer(-34);
    var row = w.addStack();
    row.layoutHorizontally(); row.centerAlignContent(); row.addSpacer();
    var vt = row.addText(String(rawPoints));
    vt.textColor = accentColor(value); vt.font = Font.boldSystemFont(22);
    var dt = row.addText("/5");
    dt.textColor = S.denom; dt.font = Font.boldSystemFont(13);
    row.addSpacer();
  }

  w.url = "scriptable:///run/RewardKidz_Widget";
  w.refreshAfterDate = new Date(Date.now() + 5*60*1000);
  return w;
}

// ============================================================
//  WIDGET SMALL RAINBOW
// ============================================================
async function buildRainbow(value, rawPoints) {
  var w = new ListWidget();
  w.backgroundColor = new Color("#08080f");
  w.setPadding(10, 10, 12, 10);

  if (value === PAUSE_VAL) {
    w.addSpacer();
    var pi = w.addImage(drawPauseIcon(80));
    pi.imageSize = new Size(80, 80); pi.resizable = false; pi.centerAlignImage();
    w.addSpacer();
  } else {
    w.addSpacer();
    var img = w.addImage(drawRainbowArc(value, 132, 66));
    img.imageSize = new Size(132, 66); img.resizable = false; img.centerAlignImage();
    w.addSpacer(10);
    var row = w.addStack();
    row.layoutHorizontally(); row.centerAlignContent(); row.addSpacer();
    var vt = row.addText(String(rawPoints));
    vt.textColor = rainbowAccent(value); vt.font = Font.boldSystemFont(24);
    var dt = row.addText("/5");
    dt.textColor = new Color("#252535"); dt.font = Font.boldSystemFont(14);
    row.addSpacer();
    w.addSpacer();
  }

  w.url = "scriptable:///run/RewardKidz_Widget";
  w.refreshAfterDate = new Date(Date.now() + 5*60*1000);
  return w;
}

// ============================================================
//  WIDGET MEDIUM
// ============================================================
async function buildMedium(value, validatedScore, rawPoints, TITLE) {
  var w = new ListWidget();
  w.backgroundGradient = makeBgGradient();
  w.setPadding(14, 16, 14, 16);
  var today = new Date().toLocaleDateString("fr-FR", {weekday:"short", day:"2-digit", month:"short"});

  if (value === PAUSE_VAL) {
    var tr = w.addStack(); tr.layoutHorizontally(); tr.centerAlignContent();
    var tt = tr.addText(TITLE); tt.textColor = S.title; tt.font = Font.semiboldSystemFont(12); tt.lineLimit = 1;
    tr.addSpacer();
    var dt = tr.addText(today); dt.textColor = S.dateText; dt.font = Font.systemFont(10);
    w.addSpacer();
    var ic = w.addText("\u23F8"); ic.font = Font.systemFont(26); ic.textColor = S.pauseIcon; ic.centerAlignText();
    w.addSpacer(5);
    var msg = w.addText("Pas de mesure aujourd'hui");
    msg.textColor = S.pauseText; msg.font = Font.systemFont(11); msg.centerAlignText();
    w.addSpacer();
  } else {
    var displayVal  = validatedScore !== null ? validatedScore  : value;
    var displayRaw  = validatedScore !== null ? Math.round(validatedScore / 2) : rawPoints;
    var tr = w.addStack(); tr.layoutHorizontally(); tr.centerAlignContent();
    var tt = tr.addText(TITLE); tt.textColor = S.title; tt.font = Font.semiboldSystemFont(12); tt.lineLimit = 1;
    tr.addSpacer();
    if (validatedScore !== null) {
      var badge = tr.addText(" \u2713 Validee");
      badge.textColor = S.badgeColor; badge.font = Font.semiboldSystemFont(10);
    }
    var dt = tr.addText("  " + today); dt.textColor = S.dateText; dt.font = Font.systemFont(10);
    w.addSpacer(10);
    var gi = w.addImage(drawBarGauge(displayVal, 280, 26, validatedScore));
    gi.imageSize = new Size(280, 26); gi.resizable = false;
    w.addSpacer(10);
    var bot = w.addStack(); bot.layoutHorizontally(); bot.centerAlignContent();
    var vt = bot.addText(String(displayRaw)); vt.textColor = accentColor(displayVal); vt.font = Font.boldSystemFont(26);
    var dn = bot.addText("/5"); dn.textColor = S.denom; dn.font = Font.boldSystemFont(16);
    bot.addSpacer();
    if (validatedScore !== null) {
      var lbl = bot.addText("Score final"); lbl.textColor = S.badgeColor; lbl.font = Font.boldSystemFont(10);
    } else {
      var lbl = bot.addText(moodLabel(rawPoints));
      lbl.textColor = accentColor(value); lbl.font = Font.boldSystemFont(11); lbl.lineLimit = 1;
    }
  }

  w.refreshAfterDate = new Date(Date.now() + 5*60*1000);
  return w;
}

// ============================================================
//  WIDGET LARGE
// ============================================================
async function buildLarge(value, validatedScore, rawPoints, historyArr, TITLE) {
  var history = parseHistoryJSON(historyArr);
  var last7   = getLast7(history);
  var avg30   = getAvg30(history);
  var trend   = getTrend(history);
  var w = new ListWidget();
  w.backgroundGradient = makeBgGradient();
  w.setPadding(16, 18, 16, 18);
  var today      = new Date().toLocaleDateString("fr-FR", {weekday:"long", day:"2-digit", month:"long"});
  var displayVal = validatedScore !== null ? validatedScore  : value;
  var displayRaw = validatedScore !== null ? Math.round(validatedScore / 2) : rawPoints;

  var tr = w.addStack(); tr.layoutHorizontally(); tr.centerAlignContent();
  var tit = tr.addText(TITLE); tit.textColor = S.title; tit.font = Font.semiboldSystemFont(13); tit.lineLimit = 1;
  tr.addSpacer();
  if (validatedScore !== null) {
    var badge = tr.addText("\u2713 Journee validee  ");
    badge.textColor = S.badgeColor; badge.font = Font.semiboldSystemFont(10);
  }
  var dtx = tr.addText(today); dtx.textColor = S.dateText; dtx.font = Font.systemFont(10);

  w.addSpacer(10);

  if (value === PAUSE_VAL) {
    var pauseRow = w.addStack();
    pauseRow.layoutHorizontally(); pauseRow.centerAlignContent();
    pauseRow.backgroundColor = S.pauseBg;
    pauseRow.cornerRadius = 8; pauseRow.setPadding(8, 14, 8, 14);
    var pico = pauseRow.addText("\u23F8");
    pico.font = Font.systemFont(18); pico.textColor = S.pauseIcon;
    pauseRow.addSpacer(10);
    var pmsg = pauseRow.addText("Pas de mesure aujourd'hui");
    pmsg.textColor = S.pauseText; pmsg.font = Font.systemFont(11); pmsg.lineLimit = 1;
    pauseRow.addSpacer();
  } else {
    var gi = w.addImage(drawBarGauge(displayVal, 290, 28, validatedScore));
    gi.imageSize = new Size(290, 28); gi.resizable = false;
    w.addSpacer(8);
    var vr = w.addStack(); vr.layoutHorizontally(); vr.centerAlignContent();
    var vt = vr.addText(String(displayRaw)); vt.textColor = accentColor(displayVal); vt.font = Font.boldSystemFont(30);
    var dn = vr.addText("/5"); dn.textColor = S.denom; dn.font = Font.boldSystemFont(18);
    vr.addSpacer();
    if (validatedScore !== null) {
      var flbl = vr.addText("Score final"); flbl.textColor = S.badgeColor; flbl.font = Font.boldSystemFont(11);
    } else {
      var mt = vr.addText(moodLabel(rawPoints));
      mt.textColor = accentColor(value); mt.font = Font.boldSystemFont(12); mt.lineLimit = 1;
    }
  }

  w.addSpacer(14);
  var sl = w.addText("7 DERNIERS JOURS"); sl.textColor = S.sectionLbl; sl.font = Font.systemFont(9);
  w.addSpacer(8);
  if (last7.length > 0) {
    var hi = w.addImage(drawHistory7(last7, 290, 80));
    hi.imageSize = new Size(290, 80); hi.resizable = false;
  } else {
    var nh = w.addText("Aucun historique");
    nh.textColor = S.muted; nh.font = Font.systemFont(10); nh.centerAlignText();
  }
  w.addSpacer(12);

  var sr = w.addStack(); sr.layoutHorizontally(); sr.centerAlignContent();
  sr.backgroundColor = S.statsBg; sr.cornerRadius = 10; sr.setPadding(8, 14, 8, 14);
  var as = sr.addStack(); as.layoutVertically();
  var al = as.addText("MOY. 30J"); al.textColor = S.muted; al.font = Font.systemFont(9);
  as.addSpacer(3);
  var av = as.addText(avg30 !== null ? String(avg30) + "/5" : "--");
  av.textColor = avg30 !== null ? accentColor(Math.round(avg30 * 2)) : S.muted;
  av.font = Font.boldSystemFont(16);
  sr.addSpacer();
  var vs = sr.addText("|"); vs.textColor = S.statsSep; vs.font = Font.systemFont(20);
  sr.addSpacer();
  var ts = sr.addStack(); ts.layoutVertically();
  var tl = ts.addText("TENDANCE"); tl.textColor = S.muted; tl.font = Font.systemFont(9);
  ts.addSpacer(3);
  var sym  = trend === "up" ? "En hausse" : trend === "down" ? "En baisse" : "Stable";
  var tcol = trend === "up" ? new Color("#40c040") : trend === "down" ? new Color("#cc3333") : S.subtitle;
  var tv = ts.addText(sym); tv.textColor = tcol; tv.font = Font.boldSystemFont(14);

  w.refreshAfterDate = new Date(Date.now() + 5*60*1000);
  return w;
}

// ============================================================
//  AFFICHAGE ERREUR (parametre manquant)
// ============================================================
function buildError(msg) {
  var w = new ListWidget();
  w.backgroundGradient = makeBgGradient();
  w.setPadding(12, 12, 12, 12);
  var t = w.addText("📊 RewardKidz");
  t.textColor = S.title; t.font = Font.semiboldSystemFont(13);
  w.addSpacer(8);
  var e = w.addText(msg);
  e.textColor = S.subtitle; e.font = Font.systemFont(11); e.lineLimit = 3;
  return w;
}

// ============================================================
//  POINT D'ENTREE
// ============================================================
var url    = args.widgetParameter ? args.widgetParameter.trim() : "";
var family = config.widgetFamily;
var param  = args.widgetParameter ? args.widgetParameter.toLowerCase().trim() : "";
var widget;

if (!url || !url.startsWith("http")) {
  widget = buildError("Configurez le parametre du widget avec l'URL generee dans RewardKidz (detail enfant > Widget Scriptable).");
} else {
  var data = await fetchWidgetData(url);
  var TITLE = data.childName;

  if (family === "large") {
    widget = await buildLarge(data.value, data.validScore, data.rawPoints, data.history, TITLE);
  } else if (family === "medium") {
    widget = await buildMedium(data.value, data.validScore, data.rawPoints, TITLE);
  } else {
    // small — rainbow si param contient "rainbow"
    widget = param.includes("rainbow")
      ? await buildRainbow(data.value, data.rawPoints)
      : await buildSmall(data.value, data.validScore, data.rawPoints);
  }
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
  // await widget.presentMedium();
  // await widget.presentLarge();
}

Script.complete();
