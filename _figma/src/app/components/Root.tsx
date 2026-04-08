import { useState, createContext, useContext } from 'react';
import { Outlet } from 'react-router';

interface Mission {
  id: string;
  title: string;
  points: number;
  completed: boolean;
  status: 'idle' | 'pending' | 'completed' | 'rejected';
  icon: string;
}

interface Child {
  id: string;
  name: string;
  level: number;
  avatar: string;
  coins: number;
  gems: number;
  currentScore: number;
  dailyGoal: number;
  isPaused: boolean;
  missions: Mission[];
}

interface AppContextType {
  children: Child[];
  currentChildId: string;
  setCurrentChildId: (id: string) => void;
  addPoints: (childId: string, points: number) => void;
  toggleMission: (childId: string, missionId: string) => void;
  validateDay: (childId: string) => void;
  togglePause: (childId: string) => void;
  approveMission: (childId: string, missionId: string) => void;
  rejectMission: (childId: string, missionId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export function Root() {
  const [currentChildId, setCurrentChildId] = useState('1');
  const [children, setChildren] = useState<Child[]>([
    {
      id: '1',
      name: 'Léa',
      level: 7,
      avatar: '👧',
      coins: 245,
      gems: 85,
      currentScore: 3,
      dailyGoal: 5,
      isPaused: false,
      missions: [
        { id: 'm1', title: 'Make Bed', points: 20, completed: true, status: 'completed', icon: '🛏️' },
        { id: 'm2', title: 'Do Homework', points: 15, completed: false, status: 'idle', icon: '📚' },
        { id: 'm3', title: 'Tidy Toys', points: 30, completed: true, status: 'completed', icon: '🧸' },
      ],
    },
    {
      id: '2',
      name: 'Lucas',
      level: 5,
      avatar: '👦',
      coins: 180,
      gems: 42,
      currentScore: 1,
      dailyGoal: 5,
      isPaused: false,
      missions: [
        { id: 'm1', title: 'Make Bed', points: 20, completed: false, status: 'idle', icon: '🛏️' },
        { id: 'm2', title: 'Do Homework', points: 15, completed: true, status: 'completed', icon: '📚' },
        { id: 'm3', title: 'Help with Dinner', points: 25, completed: false, status: 'idle', icon: '🍽️' },
      ],
    },
  ]);

  const addPoints = (childId: string, points: number) => {
    setChildren((prev) =>
      prev.map((child) =>
        child.id === childId
          ? { ...child, currentScore: Math.min(child.currentScore + points, child.dailyGoal) }
          : child
      )
    );
  };

  const toggleMission = (childId: string, missionId: string) => {
    setChildren((prev) =>
      prev.map((child) =>
        child.id === childId
          ? {
              ...child,
              missions: child.missions.map((m) =>
                m.id === missionId 
                  ? { ...m, status: m.status === 'idle' || m.status === 'rejected' ? 'pending' : m.status }
                  : m
              ),
            }
          : child
      )
    );
  };

  const validateDay = (childId: string) => {
    setChildren((prev) =>
      prev.map((child) => {
        if (child.id === childId) {
          const completedMissions = child.missions.filter((m) => m.status === 'completed');
          const missionPoints = completedMissions.reduce((acc, m) => acc + m.points, 0);
          const totalCoins = Math.floor((child.currentScore / child.dailyGoal) * 50) + missionPoints;
          const newGems = child.currentScore >= child.dailyGoal ? 10 : 0;
          
          return {
            ...child,
            coins: child.coins + totalCoins,
            gems: child.gems + newGems,
            currentScore: 0,
            isPaused: false,
            missions: child.missions.map((m) => ({ ...m, completed: false, status: 'idle' })),
          };
        }
        return child;
      })
    );
  };

  const togglePause = (childId: string) => {
    setChildren((prev) =>
      prev.map((child) =>
        child.id === childId
          ? { ...child, isPaused: !child.isPaused }
          : child
      )
    );
  };

  const approveMission = (childId: string, missionId: string) => {
    setChildren((prev) =>
      prev.map((child) =>
        child.id === childId
          ? {
              ...child,
              missions: child.missions.map((m) =>
                m.id === missionId ? { ...m, status: 'completed' } : m
              ),
            }
          : child
      )
    );
  };

  const rejectMission = (childId: string, missionId: string) => {
    setChildren((prev) =>
      prev.map((child) =>
        child.id === childId
          ? {
              ...child,
              missions: child.missions.map((m) =>
                m.id === missionId ? { ...m, status: 'rejected' } : m
              ),
            }
          : child
      )
    );
  };

  const value: AppContextType = {
    children,
    currentChildId,
    setCurrentChildId,
    addPoints,
    toggleMission,
    validateDay,
    togglePause,
    approveMission,
    rejectMission,
  };

  return (
    <AppContext.Provider value={value}>
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50">
        <Outlet />
      </div>
    </AppContext.Provider>
  );
}