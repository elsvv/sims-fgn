import { useState } from 'react'
import { GameCanvas } from './GameCanvas'
import './ui/hud.css'
import { InteractionMenu } from './ui/InteractionMenu'
import { NeedsPanel } from './ui/NeedsPanel'
import { SchedulePanel } from './ui/SchedulePanel'
import { TimeControls } from './ui/TimeControls'
import { useWorldSnapshot, WorldProvider } from './useWorld'

function ActivityLabel() {
  const snapshot = useWorldSnapshot()
  if (!snapshot.activity) return null
  return <div className="hud__activity">{snapshot.activity}</div>
}

function Hud({
  selectedProp,
  onCloseMenu,
}: {
  selectedProp: string | null
  onCloseMenu: () => void
}) {
  return (
    <div className="hud">
      <TimeControls />
      <SchedulePanel />
      <NeedsPanel />
      <ActivityLabel />
      <InteractionMenu propId={selectedProp} onClose={onCloseMenu} />
    </div>
  )
}

export function App() {
  const [selectedProp, setSelectedProp] = useState<string | null>(null)

  return (
    <WorldProvider>
      <GameCanvas onSelectProp={setSelectedProp} />
      <Hud selectedProp={selectedProp} onCloseMenu={() => setSelectedProp(null)} />
    </WorldProvider>
  )
}
