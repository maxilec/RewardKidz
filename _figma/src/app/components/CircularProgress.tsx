import React from "react";

interface CircularProgressProps {
  score: number;
  maxScore: number;
  size?: number;
}

export function CircularProgress({
  score,
  maxScore = 5,
  size = 280,
}: CircularProgressProps) {
  const isMaxScore = score >= maxScore;
  const strokeWidth = 38;
  const radius = size / 2 - strokeWidth;
  const center = size / 2;
  const totalArc = 260;
  const startAngle = 230;

  // Paramètres pour les segments anguleux
  const gap = 4; // Espace entre les segments (en degrés)
  const segmentArea = totalArc / maxScore;
  const drawAngle = segmentArea - gap;

  // Couleurs de l'animation arc-en-ciel
  const fairyColors = [
    "#FF3DFF",
    "#3DF9FF",
    "#7FFF7F",
    "#FFFF7F",
  ];

  const polarToCartesian = (
    cx: number,
    cy: number,
    r: number,
    angleDeg: number,
  ) => {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(angleRad),
      y: cy + r * Math.sin(angleRad),
    };
  };

  const describeArc = (
    x: number,
    y: number,
    r: number,
    startA: number,
    endA: number,
  ) => {
    const start = polarToCartesian(x, y, r, endA);
    const end = polarToCartesian(x, y, r, startA);
    const largeArcFlag = endA - startA <= 180 ? "0" : "1";
    return [
      "M",
      start.x,
      start.y,
      "A",
      r,
      r,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
    ].join(" ");
  };

  const progressPath = describeArc(
    center,
    center,
    radius,
    startAngle,
    startAngle + totalArc * (score / maxScore),
  );

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient
            id="normalGrad"
            x1="0%"
            y1="100%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#00D2FF" />
            <stop offset="100%" stopColor="#3AEEA9" />
          </linearGradient>

          {/* MASQUE SEGMENTÉ (Angular/Butt caps) */}
          <mask id="segmentMask">
            {Array.from({ length: maxScore }).map((_, i) => {
              const sAngle =
                startAngle + i * segmentArea + gap / 2;
              const eAngle = sAngle + drawAngle;
              return (
                <path
                  key={i}
                  d={describeArc(
                    center,
                    center,
                    radius,
                    sAngle,
                    eAngle,
                  )}
                  fill="none"
                  stroke="white"
                  strokeWidth={strokeWidth}
                  strokeLinecap="butt" // Rendu anguleux
                />
              );
            })}
          </mask>

          <filter id="glow">
            <feGaussianBlur
              stdDeviation="4"
              result="coloredBlur"
            />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. Arrière-plan (Grisé) */}
        <g mask="url(#segmentMask)">
          <path
            d={describeArc(
              center,
              center,
              radius,
              startAngle,
              startAngle + totalArc,
            )}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
          />
        </g>

        {/* 2. Progression */}
        <g mask="url(#segmentMask)">
          {isMaxScore ? (
            /* Animation Arc-en-ciel "Fairy" intégrée */
            <g filter="url(#glow)">
              <foreignObject
                x="0"
                y="0"
                width={size}
                height={size}
              >
                <div className="fairy-container">
                  <div className="rotating-base"></div>
                  <div className="blob blob-1"></div>
                  <div className="blob blob-2"></div>
                  <div className="blob blob-3"></div>
                </div>
              </foreignObject>
            </g>
          ) : (
            <path
              d={progressPath}
              fill="none"
              stroke="url(#normalGrad)"
              strokeWidth={strokeWidth}
              style={{
                transition:
                  "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          )}

          {/* Reflet Verre (Effet de brillance) */}
          <path
            d={progressPath}
            fill="none"
            stroke="white"
            strokeWidth={8}
            strokeOpacity="0.4"
            style={{ transition: "all 0.8s ease" }}
          />
        </g>
      </svg>

      {/* Interface centrale */}
      <div
        style={{
          position: "absolute",
          textAlign: "center",
          top: "40%",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: "3.5rem" }}>
          {isMaxScore ? "🌟" : "🌱"}
        </div>
        <div
          style={{
            fontSize: "2.2rem",
            fontWeight: "900",
            color: "#1E293B",
            fontFamily: "sans-serif",
          }}
        >
          {score}
          <span
            style={{ color: "#CBD5E1", fontSize: "1.4rem" }}
          >
            /{maxScore}
          </span>
        </div>
      </div>

      <style>{`
        .fairy-container {
          width: 100%; height: 100%;
          position: relative;
          background: #000;
        }
        .rotating-base {
          position: absolute; inset: -100%;
          background: conic-gradient(from 0deg, ${fairyColors.join(",")}, ${fairyColors[0]});
          animation: slow-spin 15s linear infinite;
        }
        .blob {
          position: absolute; border-radius: 50%;
          filter: blur(20px); mix-blend-mode: screen; opacity: 0.7;
        }
        .blob-1 { width: 150px; height: 150px; background: ${fairyColors[0]}; top: -10%; left: -10%; animation: breathe 6s infinite alternate; }
        .blob-2 { width: 130px; height: 130px; background: ${fairyColors[1]}; bottom: -10%; right: -10%; animation: breathe 8s infinite alternate-reverse; }
        .blob-3 { width: 140px; height: 140px; background: ${fairyColors[2]}; top: 10%; right: -10%; animation: breathe 7s infinite alternate; }

        @keyframes slow-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes breathe {
          0% { transform: scale(0.8) translate(0, 0); }
          100% { transform: scale(1.1) translate(15px, 15px); }
        }
      `}</style>
    </div>
  );
}