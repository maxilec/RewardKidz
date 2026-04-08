import { useApp } from './Root';
import { Link } from 'react-router';
import { ArrowLeft, Coins, Gem, ShoppingBag } from 'lucide-react';
import { useState } from 'react';

interface ShopItem {
  id: string;
  name: string;
  icon: string;
  coinPrice?: number;
  gemPrice?: number;
  description: string;
  category: 'rewards' | 'privileges' | 'special';
}

const shopItems: ShopItem[] = [
  {
    id: '1',
    name: 'Extra Screen Time',
    icon: '📱',
    coinPrice: 100,
    description: '+30 minutes of screen time',
    category: 'privileges',
  },
  {
    id: '2',
    name: 'Ice Cream',
    icon: '🍦',
    coinPrice: 50,
    description: 'Choose your favorite flavor!',
    category: 'rewards',
  },
  {
    id: '3',
    name: 'Movie Night',
    icon: '🎬',
    coinPrice: 150,
    description: 'Pick the movie for family night',
    category: 'privileges',
  },
  {
    id: '4',
    name: 'Small Toy',
    icon: '🎁',
    coinPrice: 200,
    description: 'New toy under $10',
    category: 'rewards',
  },
  {
    id: '5',
    name: 'Late Bedtime',
    icon: '🌙',
    coinPrice: 80,
    description: '+1 hour later bedtime',
    category: 'privileges',
  },
  {
    id: '6',
    name: 'Special Outing',
    icon: '🎪',
    gemPrice: 50,
    description: 'Trip to the park or playground',
    category: 'special',
  },
  {
    id: '7',
    name: 'New Book',
    icon: '📚',
    coinPrice: 120,
    description: 'Choose a new book to read',
    category: 'rewards',
  },
  {
    id: '8',
    name: 'Pizza Party',
    icon: '🍕',
    gemPrice: 80,
    description: 'Family pizza night!',
    category: 'special',
  },
  {
    id: '9',
    name: 'Art Supplies',
    icon: '🎨',
    coinPrice: 180,
    description: 'New crayons, markers, or paints',
    category: 'rewards',
  },
];

export function Shop() {
  const { children, currentChildId } = useApp();
  const child = children.find((c) => c.id === currentChildId);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'rewards' | 'privileges' | 'special'>('all');
  const [purchasedItem, setPurchasedItem] = useState<string | null>(null);

  if (!child) return null;

  const filteredItems = selectedCategory === 'all' 
    ? shopItems 
    : shopItems.filter(item => item.category === selectedCategory);

  const handlePurchase = (item: ShopItem) => {
    const canAfford = item.coinPrice 
      ? child.coins >= item.coinPrice 
      : item.gemPrice 
        ? child.gems >= item.gemPrice 
        : false;

    if (canAfford) {
      setPurchasedItem(item.id);
      setTimeout(() => setPurchasedItem(null), 2000);
    }
  };

  return (
    <div className="min-h-screen pb-6 max-w-md mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-pink-500 text-white p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/">
            <button className="p-2 hover:bg-white/20 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 style={{ fontFamily: 'var(--font-fredoka)' }} className="text-2xl">
              Rewards Shop
            </h1>
            <p style={{ fontFamily: 'var(--font-nunito)' }} className="text-orange-100 text-sm">
              Spend your earned rewards!
            </p>
          </div>
          <div className="text-4xl">{child.avatar}</div>
        </div>

        {/* Balance */}
        <div className="flex gap-3">
          <div className="flex-1 bg-white/20 backdrop-blur-sm rounded-2xl p-3">
            <div className="flex items-center gap-2 justify-center">
              <Coins className="w-6 h-6" />
              <div>
                <div style={{ fontFamily: 'var(--font-nunito)' }} className="text-xs opacity-90">
                  Coins
                </div>
                <div style={{ fontFamily: 'var(--font-fredoka)' }} className="text-2xl">
                  {child.coins}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 bg-white/20 backdrop-blur-sm rounded-2xl p-3">
            <div className="flex items-center gap-2 justify-center">
              <Gem className="w-6 h-6" />
              <div>
                <div style={{ fontFamily: 'var(--font-nunito)' }} className="text-xs opacity-90">
                  Gems
                </div>
                <div style={{ fontFamily: 'var(--font-fredoka)' }} className="text-2xl">
                  {child.gems}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="px-4 py-4 overflow-x-auto">
        <div className="flex gap-2">
          {[
            { key: 'all', label: '🎯 All', emoji: '🎯' },
            { key: 'rewards', label: '🎁 Rewards', emoji: '🎁' },
            { key: 'privileges', label: '⭐ Privileges', emoji: '⭐' },
            { key: 'special', label: '💎 Special', emoji: '💎' },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key as any)}
              className={`
                px-4 py-2 rounded-full whitespace-nowrap transition-all
                ${
                  selectedCategory === cat.key
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }
              `}
              style={{ fontFamily: 'var(--font-nunito)' }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Shop Items */}
      <div className="px-4 pb-6">
        <div className="grid grid-cols-2 gap-4">
          {filteredItems.map((item) => {
            const canAfford = item.coinPrice 
              ? child.coins >= item.coinPrice 
              : item.gemPrice 
                ? child.gems >= item.gemPrice 
                : false;
            
            const isPurchased = purchasedItem === item.id;

            return (
              <div
                key={item.id}
                className={`
                  bg-white rounded-2xl shadow-md p-4 transition-all
                  ${canAfford ? 'hover:shadow-xl hover:scale-105' : 'opacity-60'}
                  ${isPurchased ? 'ring-4 ring-green-400' : ''}
                `}
              >
                <div className="text-5xl mb-2 text-center">{item.icon}</div>
                <h3
                  style={{ fontFamily: 'var(--font-fredoka)' }}
                  className="text-center text-lg mb-1"
                >
                  {item.name}
                </h3>
                <p
                  style={{ fontFamily: 'var(--font-nunito)' }}
                  className="text-xs text-gray-600 text-center mb-3 h-8"
                >
                  {item.description}
                </p>

                <button
                  onClick={() => handlePurchase(item)}
                  disabled={!canAfford}
                  className={`
                    w-full py-2 rounded-xl flex items-center justify-center gap-2 transition-all
                    ${
                      isPurchased
                        ? 'bg-green-500 text-white'
                        : canAfford
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }
                  `}
                >
                  {isPurchased ? (
                    <>
                      <span style={{ fontFamily: 'var(--font-fredoka)' }}>Purchased!</span>
                      <span>✓</span>
                    </>
                  ) : (
                    <>
                      {item.coinPrice && (
                        <>
                          <Coins className="w-4 h-4" />
                          <span style={{ fontFamily: 'var(--font-fredoka)' }}>{item.coinPrice}</span>
                        </>
                      )}
                      {item.gemPrice && (
                        <>
                          <Gem className="w-4 h-4" />
                          <span style={{ fontFamily: 'var(--font-fredoka)' }}>{item.gemPrice}</span>
                        </>
                      )}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty State */}
      {filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-6xl mb-4">🛍️</div>
          <p style={{ fontFamily: 'var(--font-fredoka)' }} className="text-gray-500">
            No items in this category
          </p>
        </div>
      )}

      {/* Info Banner */}
      <div className="px-4 mt-6">
        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-orange-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="text-3xl">💡</div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-fredoka)' }} className="text-orange-700 mb-1">
                How it works
              </h3>
              <ul style={{ fontFamily: 'var(--font-nunito)' }} className="text-sm text-gray-700 space-y-1">
                <li>• Complete daily missions to earn coins</li>
                <li>• Reach your daily goal to earn gems</li>
                <li>• Spend your rewards on fun items!</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}