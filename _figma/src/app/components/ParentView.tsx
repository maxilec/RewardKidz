import { useApp } from './Root';
import { Link } from 'react-router';
import { ArrowLeft, Plus, Check, Coins, Gem, Pause, Play, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useState } from 'react';

export function ParentView() {
  const { children, addPoints, validateDay, setCurrentChildId, togglePause, approveMission, rejectMission } = useApp();
  const [showValidateConfirm, setShowValidateConfirm] = useState<string | null>(null);

  const handleQuickPoint = (childId: string) => {
    addPoints(childId, 1);
  };

  const handleValidate = (childId: string) => {
    validateDay(childId);
    setShowValidateConfirm(null);
  };

  return (
    <div className="min-h-screen pb-6 max-w-md mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/">
            <button className="p-2 hover:bg-white/20 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </button>
          </Link>
          <div>
            <h1 style={{ fontFamily: 'var(--font-fredoka)' }} className="text-2xl">
              Parent Dashboard
            </h1>
            <p style={{ fontFamily: 'var(--font-nunito)' }} className="text-purple-100 text-sm">
              Manage your children's rewards
            </p>
          </div>
        </div>
      </div>

      {/* Children List */}
      <div className="px-4 py-6 space-y-4">
        <h2 style={{ fontFamily: 'var(--font-fredoka)' }} className="text-xl mb-4">
          Family Members
        </h2>

        {children.map((child) => {
          const progressPercentage = (child.currentScore / child.dailyGoal) * 100;
          const completedMissions = child.missions.filter((m) => m.status === 'completed').length;
          const pendingMissions = child.missions.filter((m) => m.status === 'pending');
          const hasPendingMissions = pendingMissions.length > 0;

          return (
            <div key={child.id} className="bg-white rounded-2xl shadow-lg p-5 space-y-4">
              {/* Child Header */}
              <div className="flex items-center justify-between">
                <Link
                  to="/"
                  onClick={() => setCurrentChildId(child.id)}
                  className="flex items-center gap-3 flex-1"
                >
                  <div className="text-5xl">{child.avatar}</div>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-fredoka)' }} className="text-xl">
                      {child.name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                        Lv. {child.level}
                      </span>
                      <span className="flex items-center gap-1">
                        <Coins className="w-4 h-4 text-yellow-500" />
                        {child.coins}
                      </span>
                      <span className="flex items-center gap-1">
                        <Gem className="w-4 h-4 text-blue-500" />
                        {child.gems}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Quick Add Point Button */}
                <button
                  onClick={() => handleQuickPoint(child.id)}
                  className="bg-gradient-to-br from-green-400 to-emerald-500 text-white p-3 rounded-full shadow-lg hover:scale-110 transition-transform active:scale-95"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              {/* Progress */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontFamily: 'var(--font-nunito)' }} className="text-sm text-gray-600">
                    Daily Progress
                  </span>
                  <span style={{ fontFamily: 'var(--font-fredoka)' }} className="text-sm">
                    {child.currentScore}/{child.dailyGoal}
                  </span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                  />
                </div>
              </div>

              {/* Missions Status */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontFamily: 'var(--font-nunito)' }} className="text-sm text-gray-600">
                    Missions Completed
                  </span>
                  <span style={{ fontFamily: 'var(--font-fredoka)' }} className="text-sm">
                    {completedMissions}/{child.missions.length}
                  </span>
                </div>
                <div className="flex gap-2">
                  {child.missions.map((mission) => (
                    <div
                      key={mission.id}
                      className={`
                        flex-1 p-2 rounded-lg text-center text-xs transition-all
                        ${
                          mission.status === 'completed'
                            ? 'bg-green-100 text-green-700 border-2 border-green-400'
                            : mission.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-400'
                            : 'bg-gray-100 text-gray-500'
                        }
                      `}
                    >
                      <div className="text-lg mb-1">{mission.icon}</div>
                      <div style={{ fontFamily: 'var(--font-nunito)' }} className="truncate">
                        {mission.title}
                      </div>
                      {mission.status === 'pending' && (
                        <div className="text-xs mt-1">⏳</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending Missions Approval Section */}
              {hasPendingMissions && (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4">
                  <h4 style={{ fontFamily: 'var(--font-fredoka)' }} className="text-sm text-blue-800 mb-3">
                    🔔 Missions en attente de validation
                  </h4>
                  <div className="space-y-2">
                    {pendingMissions.map((mission) => (
                      <div key={mission.id} className="bg-white rounded-lg p-3 flex items-center gap-3">
                        <div className="text-2xl">{mission.icon}</div>
                        <div className="flex-1">
                          <div style={{ fontFamily: 'var(--font-nunito)' }} className="text-sm font-medium">
                            {mission.title}
                          </div>
                          <div style={{ fontFamily: 'var(--font-fredoka)' }} className="text-xs text-green-600">
                            +{mission.points} Points
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveMission(child.id, mission.id)}
                            className="bg-green-500 text-white p-2 rounded-lg hover:bg-green-600 transition-colors"
                            title="Approuver"
                          >
                            <ThumbsUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => rejectMission(child.id, mission.id)}
                            className="bg-red-500 text-white p-2 rounded-lg hover:bg-red-600 transition-colors"
                            title="Refuser"
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons: Pause and Validate Day */}
              <div className="flex gap-2">
                {/* Pause/Resume Button */}
                <button
                  onClick={() => togglePause(child.id)}
                  className={`flex-1 py-3 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 ${
                    child.isPaused
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                      : 'bg-gradient-to-r from-gray-400 to-gray-500 text-white'
                  }`}
                >
                  {child.isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                  <span style={{ fontFamily: 'var(--font-fredoka)' }}>
                    {child.isPaused ? 'Reprendre' : 'Pause'}
                  </span>
                </button>

                {/* Validate Day Button */}
                {showValidateConfirm === child.id ? (
                  <div className="flex-1 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleValidate(child.id)}
                        className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-2 rounded-lg text-xs hover:shadow-lg transition-shadow"
                        style={{ fontFamily: 'var(--font-fredoka)' }}
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setShowValidateConfirm(null)}
                        className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg text-xs hover:bg-gray-400 transition-colors"
                        style={{ fontFamily: 'var(--font-fredoka)' }}
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowValidateConfirm(child.id)}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-xl shadow-md hover:shadow-lg transition-shadow flex items-center justify-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    <span style={{ fontFamily: 'var(--font-fredoka)' }}>
                      Validate
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tips Section */}
      <div className="px-4 mt-6">
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-purple-200 rounded-2xl p-4">
          <h3 style={{ fontFamily: 'var(--font-fredoka)' }} className="text-lg text-purple-700 mb-2">
            💡 Parent Tips
          </h3>
          <ul style={{ fontFamily: 'var(--font-nunito)' }} className="text-sm text-gray-700 space-y-1">
            <li>• Use the + button for quick point rewards</li>
            <li>• Validate the day to convert points to coins and gems</li>
            <li>• Encourage mission completion for bonus rewards</li>
            <li>• Check back daily to maintain streaks!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}