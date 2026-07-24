import { useState } from 'react'
import { GameCanvas } from './GameCanvas'
import { WorldProvider } from './useWorld'

export function App() {
  const [, setSelectedProp] = useState<string | null>(null)

  return (
    <WorldProvider>
      <GameCanvas onSelectProp={setSelectedProp} />
    </WorldProvider>
  )
}
