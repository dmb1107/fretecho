import { useState } from 'react';
import { TrainingScreen } from './ui/TrainingScreen';
import { StatsScreen } from './ui/StatsScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { HelpScreen } from './ui/HelpScreen';

type Tab = 'train' | 'stats' | 'settings' | 'help';

export default function App() {
  const [tab, setTab] = useState<Tab>('train');
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-3 py-2 sm:px-6 sm:py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-brand text-lg sm:text-2xl font-bold">FretEcho</span>
            <span className="text-neutral-500 text-xs hidden sm:inline">Fretboard trainer</span>
          </div>
          <nav className="flex gap-0.5 sm:gap-1">
            <TabButton current={tab} tab="train" onClick={() => setTab('train')}>
              Train
            </TabButton>
            <TabButton current={tab} tab="stats" onClick={() => setTab('stats')}>
              Stats
            </TabButton>
            <TabButton current={tab} tab="settings" onClick={() => setTab('settings')}>
              Settings
            </TabButton>
            <TabButton current={tab} tab="help" onClick={() => setTab('help')}>
              Help
            </TabButton>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        {tab === 'train' && <TrainingScreen />}
        {tab === 'stats' && <StatsScreen />}
        {tab === 'settings' && <SettingsScreen />}
        {tab === 'help' && <HelpScreen />}
      </main>
    </div>
  );
}

function TabButton({
  current,
  tab,
  children,
  onClick,
}: {
  current: Tab;
  tab: Tab;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const active = current === tab;
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 sm:px-4 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition ${
        active ? 'bg-brand text-black' : 'text-neutral-300 hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
  );
}
