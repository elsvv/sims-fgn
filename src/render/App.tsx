import { useState } from 'react'
import { GameCanvas } from './GameCanvas'
import { ConversationPanel } from './ui/ConversationPanel'
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
 * На семинаре и в разговоре её нет: там же, внизу по центру, стоят панель
 * выступления и окно сцены, и две плашки в одном месте наложились бы друг
 * на друга. Спор за это место решается не в пользу надписи «Взять кофе».
 */
function ActivityLabel() {
  const snapshot = useWorldSnapshot()
  if (!snapshot.activity || snapshot.seminar || snapshot.activeChain) return null
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
      {/* Окна разговоров объявлены последними: они перекрывают всё
          остальное, пока игрок не ответил. Сцена идёт после короткого
          обмена репликами — из двух окон верхним должно быть то,
          которое ведёт разговор, а не то, которое его начинало. */}
      <DialoguePanel />
      <ConversationPanel />
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
