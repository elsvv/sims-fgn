import { GameCanvas } from './GameCanvas'
import { WorldProvider } from './useWorld'

export function App() {
  return (
    <WorldProvider>
      <GameCanvas />
    </WorldProvider>
  )
}
