import { useApp } from "./Root";
import { CircularProgress } from "./CircularProgress";
import { Link } from "react-router";
import {
  Rocket,
  Gift,
  BarChart3,
  User,
  Users,
  Coins,
  Gem,
} from "lucide-react";

export function ChildView() {
  const { children, currentChildId, toggleMission } = useApp();
  const child = children.find((c) => c.id === currentChildId);

  if (!child) return null;

  const completedMissions = child.missions.filter(
    (m) => m.status === 'completed',
  ).length;

  const handleMissionClick = (missionId: string) => {
    const mission = child.missions.find(m => m.id === missionId);
    if (!mission) return;

    // Si la mission est idle ou rejected, passer en pending
    if (mission.status === 'idle' || mission.status === 'rejected') {
      toggleMission(child.id, missionId);
    }
  };

  return (
    <div className="min-h-screen pb-20 max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white rounded-b-3xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-5xl">{child.avatar}</div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  style={{ fontFamily: "var(--font-fredoka)" }}
                  className="text-xl"
                >
                  Reward
                  <span className="text-orange-500">Kidz</span>
                </span>
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <span
                  style={{ fontFamily: "var(--font-nunito)" }}
                >
                  {child.name}
                </span>
                <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  Lv. {child.level}
                </span>
              </div>
            </div>
          </div>
          <Link to="/parent">
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <Users className="w-6 h-6 text-gray-600" />
            </button>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6 space-y-6">
        {/* Card containing gauge and missions */}
        <div className="relative mt-6">
          <div className="bg-white rounded-3xl shadow-lg p-6 pt-8 pb-6 relative">
            <div className="flex flex-col items-center relative z-10">
              <div className="relative mb-8 mt-4">
                <CircularProgress
                  score={child.currentScore}
                  maxScore={child.dailyGoal}
                  size={400}
                  isPaused={child.isPaused}
                />
              </div>

              {/* Daily Missions Progress with 3 dots at 33%, 66%, 100% */}
              <div className="w-full mt-4 mb-6">
                <div className="mb-3 text-center">
                  <span
                    style={{
                      fontFamily: "var(--font-fredoka)",
                    }}
                    className="text-base text-gray-800"
                  >
                    Mission du jour
                  </span>
                </div>

                {/* Progress bar with dots */}
                <div className="relative">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500 rounded-full"
                      style={{
                        width: `${(completedMissions / child.missions.length) * 100}%`,
                      }}
                    />
                  </div>
                  {/* 3 progress dots at 33%, 66%, 100% */}
                  <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 pointer-events-none">
                    {[33.33, 66.66, 100].map(
                      (position, index) => {
                        const missionThreshold = index + 1; // 1, 2, 3 missions
                        const isCompleted =
                          completedMissions >= missionThreshold;

                        return (
                          <div
                            key={position}
                            className={`absolute w-3 h-3 rounded-full border-2 transition-all duration-300 ${
                              isCompleted
                                ? "bg-emerald-500 border-emerald-600 scale-110"
                                : "bg-white border-gray-300"
                            }`}
                            style={{
                              left: `${position}%`,
                              transform:
                                "translate(-50%, -50%)",
                            }}
                          />
                        );
                      },
                    )}
                  </div>
                </div>
              </div>

              {/* Missions inside the card */}
              <div className="w-full space-y-3">
                {child.missions.map((mission) => {
                  const isCompleted = mission.status === 'completed';
                  const isPending = mission.status === 'pending';
                  const isRejected = mission.status === 'rejected';
                  
                  return (
                    <button
                      key={mission.id}
                      onClick={() => handleMissionClick(mission.id)}
                      disabled={isPending}
                      className={`
                        relative w-full p-4 rounded-2xl transition-all duration-300 shadow-md
                        ${
                          isCompleted
                            ? "bg-gradient-to-br from-green-400 to-emerald-500 text-white"
                            : isPending
                            ? "bg-gradient-to-br from-yellow-300 to-orange-400 text-white cursor-wait"
                            : isRejected
                            ? "bg-gradient-to-br from-red-100 to-pink-100 text-gray-700 hover:shadow-lg"
                            : "bg-white hover:shadow-lg"
                        }
                      `}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-4xl">
                          {mission.icon}
                        </div>
                        <div className="flex-1 text-left">
                          <div
                            style={{
                              fontFamily: "var(--font-nunito)",
                            }}
                            className={`text-base ${isCompleted || isPending ? "text-white" : "text-gray-700"}`}
                          >
                            {mission.title}
                          </div>
                          <div
                            style={{
                              fontFamily: "var(--font-fredoka)",
                            }}
                            className={`text-sm ${isCompleted || isPending ? "text-white/90" : isRejected ? "text-red-600" : "text-green-600"}`}
                          >
                            {isRejected ? "Encore un effort !" : `+${mission.points} Points`}
                          </div>
                        </div>
                        {isCompleted && (
                          <div className="text-3xl">✅</div>
                        )}
                        {isPending && (
                          <div className="text-3xl">⏳</div>
                        )}
                        {isRejected && (
                          <div className="text-3xl">❌</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Wallet chip overlapping the card */}
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-10 w-auto min-w-[240px]">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-full shadow-lg px-5 py-2 flex items-center justify-start gap-6 border-2 border-white/20">
              {/* Section Pièces */}
              <div className="flex items-center gap-2">
                <div className="bg-yellow-400/20 p-1.5 rounded-lg flex-shrink-0">
                  <Coins className="w-5 h-5 text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.5)]" />
                </div>
                <div className="flex flex-col -space-y-1">
                  <span
                    style={{ fontFamily: "var(--font-nunito)" }}
                    className="text-white/80 text-[10px] uppercase font-bold tracking-wider"
                  >
                    Pièces
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-fredoka)",
                    }}
                    className="text-white text-lg font-medium leading-none"
                  >
                    {child.coins}
                  </span>
                </div>
              </div>

              {/* Séparateur Vertical */}
              <div className="w-px h-7 bg-white/20 flex-shrink-0"></div>

              {/* Section Gems */}
              <div className="flex items-center gap-2">
                <div className="bg-blue-400/20 p-1.5 rounded-lg flex-shrink-0">
                  <Gem className="w-5 h-5 text-blue-300 drop-shadow-[0_0_8px_rgba(147,197,253,0.5)]" />
                </div>
                <div className="flex flex-col -space-y-1">
                  <span
                    style={{ fontFamily: "var(--font-nunito)" }}
                    className="text-white/80 text-[10px] uppercase font-bold tracking-wider"
                  >
                    Gems
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-fredoka)",
                    }}
                    className="text-white text-lg font-medium leading-none"
                  >
                    {child.gems}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 rounded-t-3xl shadow-lg max-w-md mx-auto">
        <div className="flex items-center justify-around py-3 px-4">
          <button className="flex flex-col items-center gap-1 text-purple-600">
            <Rocket className="w-6 h-6" />
            <span
              style={{ fontFamily: "var(--font-nunito)" }}
              className="text-xs"
            >
              Missions
            </span>
          </button>
          <Link
            to="/shop"
            className="flex flex-col items-center gap-1 text-gray-400 hover:text-purple-600 transition-colors"
          >
            <Gift className="w-6 h-6" />
            <span
              style={{ fontFamily: "var(--font-nunito)" }}
              className="text-xs"
            >
              Rewards
            </span>
          </Link>
          <button className="flex flex-col items-center gap-1 text-gray-400 hover:text-purple-600 transition-colors">
            <BarChart3 className="w-6 h-6" />
            <span
              style={{ fontFamily: "var(--font-nunito)" }}
              className="text-xs"
            >
              History
            </span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400 hover:text-purple-600 transition-colors">
            <User className="w-6 h-6" />
            <span
              style={{ fontFamily: "var(--font-nunito)" }}
              className="text-xs"
            >
              My Avatar
            </span>
          </button>
          <Link
            to="/parent"
            className="flex flex-col items-center gap-1 text-gray-400 hover:text-purple-600 transition-colors"
          >
            <Users className="w-6 h-6" />
            <span
              style={{ fontFamily: "var(--font-nunito)" }}
              className="text-xs"
            >
              Leaderboard
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}