import { useState } from 'react'
import { GameCanvas } from './GameCanvas'
import { DialoguePanel } from './ui/DialoguePanel'
import './ui/hud.css'
import { InteractionMenu } from './ui/InteractionMenu'
import { NeedsPanel } from './ui/NeedsPanel'
import { PeoplePanel } from './ui/PeoplePanel'
import { SchedulePanel } from './ui/SchedulePanel'
import { SeminarPanel } from './ui/SeminarPanel'
import { SkillsPanel } from './ui/SkillsPanel'
import { TimeControls } from './ui/TimeControls'
import { useWorldSnapshot, WorldProvider } from './useWorld'

/**
 * Подпись текущего действия внизу экрана.
 *
 * На семинаре её нет: там же, внизу по центру, стоит панель выступления,
 * и две плашки в одном месте наложились бы друг на друга. Спор за это место
 * решается в пользу семинара — он важнее, чем надпись «Взять кофе».
 */
function ActivityLabel() {
  const snapshot = useWorldSnapshot()
  if (!snapshot.activity || snapshot.seminar) return null
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
      <PeoplePanel />
      <NeedsPanel />
      <SkillsPanel />
      <ActivityLabel />
      <SeminarPanel />
      <InteractionMenu propId={selectedProp} onClose={onCloseMenu} />
      {/* Окно разговора объявлено последним: оно перекрывает всё
          остальное, пока игрок не ответил. */}
      <DialoguePanel />
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
