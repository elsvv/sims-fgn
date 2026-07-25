import { Suspense } from 'react'
import type { CharacterAppearance } from '../../shared/appearance'
import { ModelErrorBoundary } from '../ModelErrorBoundary'
import { GltfCharacter } from './GltfCharacter'
import type { Posture } from './posture'
import { ProceduralCharacter } from './ProceduralCharacter'

/**
 * Человек на этаже — один вход для всех, кто рисует людей.
 *
 * Компонент решает единственный вопрос: моделью человек нарисован
 * или капсулами. Оба пути принимают одно и то же описание внешности
 * и занимают одно и то же место, поэтому подмена незаметна ни игроку,
 * ни вызывающему коду.
 *
 * Запасной путь обязателен, и вот почему. Модели персонажей — это
 * четыре мегабайта в девяти файлах, которые едут по сети. Любой из них
 * может не доехать, приехать битым или пропасть при сборке. Игра, у
 * которой из-за одного файла исчезли все люди, — это не игра, а чёрный
 * этаж с расписанием. Поэтому капсульный человечек никуда не делся:
 * он не наследие, а нижний слой.
 *
 * Ловушек две, потому что случая тоже два. `Suspense` — это «файл ещё
 * едет»: капсульный человечек стоит и ходит, пока идёт загрузка, и
 * сменяется моделью, когда она приедет. `ModelErrorBoundary` — это
 * «файл не приедет никогда»: капсульный остаётся навсегда, а причина
 * уходит в консоль.
 */
export function Character({
  appearance,
  posture,
  seatHeight = null,
}: {
  appearance: CharacterAppearance
  posture: Posture
  /** Высота сиденья под человеком в метрах. null — человек не на стуле. */
  seatHeight?: number | null
}) {
  const fallback = (
    <ProceduralCharacter
      appearance={appearance}
      posture={posture}
      seatHeight={seatHeight}
    />
  )
  return (
    <ModelErrorBoundary what="человек" fallback={fallback}>
      <Suspense fallback={fallback}>
        <GltfCharacter
          appearance={appearance}
          posture={posture}
          seatHeight={seatHeight}
        />
      </Suspense>
    </ModelErrorBoundary>
  )
}
