/**
 * Готовит звук для сборки игры.
 *
 * Что делает и зачем. Разведка (research/assets-audio.md) скачала 48 файлов
 * атмосферы и 10 музыкальных треков — 56 МБ в assets-research/, каталог
 * в .gitignore. В игру нужна малая часть, и не в том виде, в каком скачана:
 *
 * 1. Всё перекодируется в MP3 96 кбит/с. Этого хватает и для фона, и для
 *    коротких звуков: играть их будут поверх сцены, под музыку и на
 *    ноутбучных динамиках, где разницу со 192 не слышно.
 * 2. Короткие звуки сводятся в моно. Разовый щелчок кофейного автомата
 *    всё равно панорамируется по месту события (см. distance.ts), и
 *    записанная стереокартинка этому только мешает.
 * 3. Из длинных записей вырезаются нужные куски: в «university elevator
 *    door» 42 секунды, а дверь открывается в первые три.
 * 4. Отдельные шаги вырезаются по одному из чистой записи ходьбы:
 *    в ней шаг отделён от шага полусекундной тишиной, и это ровно то,
 *    из чего собирается шаг под ногами персонажа.
 * 5. Петли атмосферы сшиваются в кольцо: хвост записи накладывается
 *    кроссфейдом на её начало. Без этого на каждом обороте слышен шов,
 *    а в коридоре игрок проводит часы.
 * 6. Всё выравнивается по громкости. Записи собраны у полутора десятков
 *    разных людей: шаг из одной шёл на -36 дБ, кран из другой — на -3.
 *    Без выравнивания шагов не слышно вовсе, а от крана вздрагиваешь,
 *    и никакими коэффициентами в каталоге это не лечится — там задаётся
 *    замысел («шаги тише разговора»), а не поправка на чужой микрофон.
 *
 *
 * Запуск: node tools/build-audio.mjs
 * Требует ffmpeg в PATH и распакованных ассетов в assets-research/audio/.
 * Результат — public/audio/, он в репозитории есть.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'assets-research/audio')
const TARGET = join(ROOT, 'public/audio')

/** Битрейт для всего. 96 кбит/с — потолок разумного для фонового звука. */
const BITRATE = '96k'

/** Длина кроссфейда, которым петля сшивается в кольцо, в секундах. */
const LOOP_SEAM = 2

/**
 * Потолок длины петли атмосферы, секунды.
 *
 * Дело не в весе файла, а в оперативной памяти: петля играет через
 * AudioBufferSourceNode, то есть распакованной, и минута стерео на
 * 44.1 кГц — это двадцать мегабайт живой памяти на слой. Тридцать шесть
 * секунд дают двенадцать, и повтор на слух ещё не читается: в комнатном
 * гуле нет мелодии, за которую ухо могло бы зацепиться.
 */
const MAX_LOOP_SECONDS = 36

/**
 * Целевая громкость непрерывных слоёв по EBU R128, LUFS. Музыка чуть
 * громче атмосферы: атмосфера — воздух, её положено замечать, а не
 * слушать. Обе величины ниже вещательных -23: игра всё равно сводится
 * коэффициентами микшера, а запас до перегрузки лишним не бывает.
 */
const MUSIC_LUFS = -19
const AMBIENCE_LUFS = -24

/** Целевой пик разового звука, дБFS. Транзиенту важен пик, а не LUFS. */
const SFX_PEAK_DB = -3

/**
 * Музыка. Стерео: ширина — половина того, ради чего музыку вообще
 * включают. Ничего не обрезается, треки играют целиком.
 */
const MUSIC = [
  { from: 'music/calm-piano-vaporware.mp3', to: 'music/day.mp3' },
  { from: 'music-proto/music-proto-lounge.mp3', to: 'music/lounge.mp3' },
  { from: 'music-proto/music-proto-library-sparse.mp3', to: 'music/lesson.mp3' },
  { from: 'music/yoiyami-core-theme.mp3', to: 'music/session.mp3' },
  { from: 'music/forget-me-not-looped.ogg', to: 'music/night.mp3' },
  { from: 'music/first-light-particles.mp3', to: 'music/epilogue.mp3' },
]

/**
 * Атмосфера. Стерео и кольцом. Длина — сколько есть: чем длиннее петля,
 * тем позже ухо опознаёт в ней повтор.
 */
const AMBIENCE = [
  { from: 'ambience/corridor/corridor-hallway-ambience.mp3', to: 'ambience/corridor.mp3' },
  { from: 'ambience/corridor/corridor-before-class-walla.mp3', to: 'ambience/corridor-busy.mp3' },
  { from: 'ambience/lecture/lecture-low-room-tone.mp3', to: 'ambience/lecture.mp3' },
  { from: 'ambience/lecture/lecture-classroom-ambience.mp3', to: 'ambience/lecture-class.mp3' },
  { from: 'ambience/toilet/toilet-public-bathroom-loop.mp3', to: 'ambience/toilet.mp3' },
  { from: 'ambience/elevator/elevator-soviet-blockhouse.mp3', to: 'ambience/elevator-hall.mp3' },
]

/**
 * Разовые звуки. Моно, вырезаны по месту события.
 *
 * Границы кусков найдены детектором тишины ffmpeg по каждому файлу, а не
 * на глаз: `silencedetect=noise=-32dB` показывает, где в сорокасекундной
 * записи лежат те три секунды, ради которых её скачали.
 */
const SFX = [
  // Три шага из «Footsteps one person CLEAN»: три разных удара подошвы,
  // чтобы ходьба не звучала метрономом. Начала взяты за 20 мс до атаки.
  { from: 'ambience/corridor/corridor-footsteps-single-clean.mp3', to: 'sfx/step-1.mp3', start: 1.16, duration: 0.26 },
  { from: 'ambience/corridor/corridor-footsteps-single-clean.mp3', to: 'sfx/step-2.mp3', start: 2.58, duration: 0.26 },
  { from: 'ambience/corridor/corridor-footsteps-single-clean.mp3', to: 'sfx/step-3.mp3', start: 3.2, duration: 0.26 },

  { from: 'ambience/canteen/canteen-coffee-machine-gurgle.mp3', to: 'sfx/coffee.mp3', start: 2, duration: 2.2 },
  { from: 'ambience/toilet/toilet-flush-refill.mp3', to: 'sfx/flush.mp3', start: 0.35, duration: 9 },
  { from: 'ambience/toilet/toilet-tap-water.mp3', to: 'sfx/tap.mp3', start: 1.35, duration: 4.6 },
  { from: 'ambience/elevator/elevator-university-doors.mp3', to: 'sfx/elevator-doors.mp3', start: 0.35, duration: 3.4 },
  { from: 'ambience/elevator/elevator-bell-low-ding.mp3', to: 'sfx/elevator-ding.mp3' },
  { from: 'ambience/lecture/lecture-squeaky-chair.mp3', to: 'sfx/chair.mp3', start: 1.8, duration: 2.95 },
  { from: 'ambience/lecture/lecture-page-turn.mp3', to: 'sfx/page.mp3' },
  { from: 'ambience/lecture/lecture-paper-rustle.mp3', to: 'sfx/paper.mp3' },
  { from: 'ambience/lecture/lecture-pen-writing.mp3', to: 'sfx/pen.mp3', start: 0.4, duration: 5.5 },
]

/**
 * Вокализы симлиша. Отрендерены прототипом (proto-src/simlish.py) в WAV
 * и обрабатываются как разовые звуки: моно, выровнены по пику. Голос
 * должен звучать одинаково громко у обоих персонажей — разницу между
 * ними делают высота и форманты, а не то, кого ближе поднесли к микрофону.
 */
const VOICE = ['marey', 'alieva'].flatMap((bank) =>
  ['statement', 'question', 'cheerful', 'displeased'].map((emotion) => ({
    from: `simlish-proto/${bank}-${emotion}.wav`,
    to: `voice/${bank}-${emotion}.mp3`,
  })),
)

function run(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}

function durationOf(path) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    path,
  ])
  return Number.parseFloat(out.toString().trim())
}

function ensureDir(path) {
  mkdirSync(dirname(path), { recursive: true })
}

/** Прогон ffmpeg ради того, что он пишет в stderr: замеры идут туда. */
function measure(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], {
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(result.stderr ?? 'ffmpeg не запустился')
  return result.stderr
}

/** Пиковая громкость файла в дБFS. */
function peakOf(path) {
  const out = measure(['-i', path, '-af', 'volumedetect', '-f', 'null', '-'])
  const match = /max_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(out)
  if (match === null) throw new Error(`не удалось замерить пик: ${path}`)
  return Number.parseFloat(match[1])
}

/**
 * Замер громкости по EBU R128.
 *
 * Выравнивание идёт в два прохода нарочно: однопроходный loudnorm — это
 * динамический компрессор, он подтягивает тихие места на ходу и съедает
 * ту самую разницу между «пусто» и «перед парой», ради которой в игре
 * две записи коридора. Замер и применение замеренного оставляют форму
 * записи нетронутой и двигают её целиком.
 */
function measureLoudness(path, targetLufs) {
  const filter = `loudnorm=I=${targetLufs}:TP=-2:LRA=11:print_format=json`
  const out = measure(['-i', path, '-af', filter, '-f', 'null', '-'])
  const start = out.lastIndexOf('{')
  const end = out.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error(`не удалось замерить громкость: ${path}`)
  return JSON.parse(out.slice(start, end + 1))
}

/** Фильтр второго прохода: сдвиг на замеренную величину, без компрессии. */
function loudnormFilter(measured, targetLufs) {
  return [
    `loudnorm=I=${targetLufs}:TP=-2:LRA=11`,
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    'linear=true',
    'print_format=summary',
  ].join(':')
}

/** Простое перекодирование: стерео, без обрезки, с выравниванием громкости. */
function convertMusic({ from, to }) {
  const input = join(SOURCE, from)
  const output = join(TARGET, to)
  ensureDir(output)
  const measured = measureLoudness(input, MUSIC_LUFS)
  run([
    '-i', input,
    '-af', loudnormFilter(measured, MUSIC_LUFS),
    '-vn', '-ac', '2', '-ar', '44100', '-b:a', BITRATE,
    output,
  ])
  return output
}

/**
 * Петля без шва.
 *
 * Запись длины T режется на хвост [T-X, T], голову [0, X] и середину
 * [X, T-X]. Хвост накладывается на голову кроссфейдом длины X, результат
 * ставится перед серединой. Получается запись длины T-X, у которой конец
 * переходит в начало ровно так же, как переходил внутри исходной записи:
 * стыка нет по построению.
 */
function convertAmbience({ from, to }) {
  const input = join(SOURCE, from)
  const output = join(TARGET, to)
  ensureDir(output)
  const total = Math.min(durationOf(input), MAX_LOOP_SECONDS)
  const seam = Math.min(LOOP_SEAM, total / 4)
  const measured = measureLoudness(input, AMBIENCE_LUFS)
  const filter = [
    `[0:a]atrim=start=${total - seam}:end=${total},asetpts=PTS-STARTPTS[tail]`,
    `[1:a]atrim=start=0:end=${seam},asetpts=PTS-STARTPTS[head]`,
    `[tail][head]acrossfade=d=${seam}:c1=tri:c2=tri[seam]`,
    `[2:a]atrim=start=${seam}:end=${total - seam},asetpts=PTS-STARTPTS[body]`,
    `[seam][body]concat=n=2:v=0:a=1,${loudnormFilter(measured, AMBIENCE_LUFS)}[out]`,
  ].join(';')
  run([
    '-i', input, '-i', input, '-i', input,
    '-filter_complex', filter,
    '-map', '[out]',
    '-vn', '-ac', '2', '-ar', '44100', '-b:a', BITRATE,
    output,
  ])
  return output
}

/**
 * Разовый звук: моно, вырезанный кусок, микрофейды по краям.
 *
 * Фейды обязательны: резать волну посреди периода — значит поставить
 * в начало и в конец щелчок, и щелчок этот слышно лучше, чем сам звук.
 */
function convertSfx({ from, to, start = 0, duration }) {
  const input = join(SOURCE, from)
  const output = join(TARGET, to)
  ensureDir(output)
  const length = duration ?? durationOf(input) - start
  const fadeOut = Math.min(0.12, length / 3)
  const cut = ['-ss', String(start), '-t', String(length), '-i', input]
  const shape = `afade=t=in:st=0:d=0.008,afade=t=out:st=${length - fadeOut}:d=${fadeOut}`

  // Пик замеряется по уже вырезанному куску, а не по всей записи: в файле
  // с краном сорок секунд, и громче всего в нём то, что в игру не попадёт.
  const probe = join(TARGET, 'sfx/.probe.wav')
  ensureDir(probe)
  run([...cut, '-af', shape, '-ac', '1', '-ar', '44100', probe])
  const gain = SFX_PEAK_DB - peakOf(probe)
  rmSync(probe)

  run([
    ...cut,
    '-af', `${shape},volume=${gain.toFixed(2)}dB`,
    '-vn', '-ac', '1', '-ar', '44100', '-b:a', BITRATE,
    output,
  ])
  return output
}

function report(label, files) {
  let bytes = 0
  for (const file of files) {
    const size = statSync(file).size
    if (size === 0) throw new Error(`пустой файл на выходе: ${file}`)
    bytes += size
  }
  console.log(`${label}: ${files.length} файлов, ${(bytes / 1024 / 1024).toFixed(1)} МБ`)
}

mkdirSync(TARGET, { recursive: true })
report('музыка', MUSIC.map(convertMusic))
report('атмосфера', AMBIENCE.map(convertAmbience))
report('звуки', SFX.map(convertSfx))
report('голоса', VOICE.map(convertSfx))
