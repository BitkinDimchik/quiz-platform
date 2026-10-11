/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderStageQuestion, type StageDom, type StageMediaController } from './stage-render';
import type { HostBgm } from '../stage/bgm';
import type { QuestionView } from './types';

const TINY_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

function stubCtrl(): StageMediaController {
  let last: QuestionView | null = null;
  let token = 0;
  let unlocked = false;
  let vidQid = '';
  return {
    getAudioGateToken: () => token,
    bumpAudioGateToken: () => ++token,
    isVideoSoundUnlocked: () => unlocked,
    setVideoSoundUnlocked: (v) => {
      unlocked = v;
    },
    getVideoSoundQuestionId: () => vidQid,
    setVideoSoundQuestionId: (id) => {
      vidQid = id;
    },
    getLastQuestion: () => last,
    setLastQuestion: (q) => {
      last = q;
    },
    bgm: { resume() {}, pause() {} } as HostBgm,
    getSessionPhase: () => 'answer_reveal',
    notifyListenMediaPlay: () => {},
    notifyListenMediaEnded: () => {},
  };
}

function mountDom(): StageDom {
  document.body.innerHTML = `
    <div class="stage-center">
      <div id="stageQuestion"></div>
      <div id="stageMedia"><button id="btnHostVideoSound" type="button"></button></div>
      <div id="stageExplanationLabel"></div>
      <div id="stageExplanation"></div>
      <div id="stageExplanationImage"></div>
      <div id="stageExplanationVideo"></div>
      <div id="stageMeta"></div>
      <div id="stageAnswers"></div>
    </div>
  `;
  return {
    stageQuestion: document.getElementById('stageQuestion'),
    stageMedia: document.getElementById('stageMedia'),
    stageExplanation: document.getElementById('stageExplanation'),
    stageExplanationImage: document.getElementById('stageExplanationImage'),
    stageExplanationVideo: document.getElementById('stageExplanationVideo'),
    stageMeta: document.getElementById('stageMeta'),
    stageAnswers: document.getElementById('stageAnswers'),
    btnHostVideoSound: document.getElementById('btnHostVideoSound'),
  };
}

function sampleQ(over: Partial<QuestionView> = {}): QuestionView {
  return {
    id: 'q1',
    type: 'single_choice',
    prompt: '2+2?',
    options: [
      { id: 'o1', label: '4' },
      { id: 'o2', label: '5' },
    ],
    correctOptionIds: ['o1'],
    explanationText: 'Потому что',
    explanationImageUrl: TINY_GIF,
    ...over,
  };
}

describe('renderStageQuestion explanation', () => {
  let dom: StageDom;
  let ctrl: StageMediaController;

  beforeEach(() => {
    dom = mountDom();
    ctrl = stubCtrl();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('preserves line breaks in question prompt', () => {
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({
        prompt: 'Расположите события в правильном порядке\n1 Нападение тролля\n2 Урок полётов\n3 Первый матч',
      }),
      false,
      'question',
    );
    expect(dom.stageQuestion?.textContent).toBe(
      'Расположите события в правильном порядке\n1 Нападение тролля\n2 Урок полётов\n3 Первый матч',
    );
  });

  it('sets data-stage-key on prompt and answers', () => {
    renderStageQuestion(dom, ctrl, sampleQ(), false, 'question');
    expect(dom.stageQuestion?.getAttribute('data-stage-key')).toBe('prompt');
    expect(dom.stageMedia?.getAttribute('data-stage-key')).toBe('media');
    const keys = [...(dom.stageAnswers?.querySelectorAll('[data-stage-key]') || [])].map((n) =>
      n.getAttribute('data-stage-key'),
    );
    expect(keys).toContain('answer:o1');
    expect(keys).toContain('answer:o2');
  });

  it('hides explanation before reveal', () => {
    renderStageQuestion(dom, ctrl, sampleQ(), false, 'question');
    const el = dom.stageExplanation!;
    expect(el.innerHTML.trim()).toBe('');
    expect(el.style.display).toBe('none');
    expect(el.getAttribute('data-stage-key')).toBeNull();
    expect(dom.stageExplanationImage?.style.display).toBe('none');
    expect(dom.stageExplanationImage?.getAttribute('data-stage-key')).toBeNull();
    const label = document.getElementById('stageExplanationLabel');
    expect(label?.textContent).toBe('');
    expect(label?.style.display).toBe('none');
    expect(label?.getAttribute('data-stage-key')).toBeNull();
  });

  it('shows text and image as separate stage objects when showCorrect', () => {
    renderStageQuestion(dom, ctrl, sampleQ(), true);
    const el = dom.stageExplanation!;
    const imgSlot = dom.stageExplanationImage!;
    expect(el.style.display).toBe('flex');
    expect(el.textContent).toBe('Потому что');
    expect(el.getAttribute('data-stage-key')).toBe('explanation');
    expect(imgSlot.style.display).toBe('flex');
    expect(imgSlot.getAttribute('data-stage-key')).toBe('explanationImage');
    expect(imgSlot.classList.contains('stage-answer')).toBe(true);
    expect(imgSlot.classList.contains('answer--visual')).toBe(true);
    const img = imgSlot.querySelector('img.host-stage__explanation-img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe(TINY_GIF);
    expect(dom.stageQuestion?.style.display).not.toBe('none');
    expect(dom.stageQuestion?.textContent).toBe('2+2?');
    expect(document.querySelector('.stage-center')?.getAttribute('data-stage-reveal')).toBe('1');
    const label = document.getElementById('stageExplanationLabel');
    expect(label?.style.display).toBe('none');
  });

  it('shows explanation video on reveal like explanation image', () => {
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({
        explanationText: '',
        explanationImageUrl: null,
        explanationVideoUrl: '/uploads/video/expl.mp4',
      }),
      true,
    );
    const videoSlot = dom.stageExplanationVideo!;
    expect(videoSlot.style.display).toBe('flex');
    expect(videoSlot.getAttribute('data-stage-key')).toBe('explanationVideo');
    const video = videoSlot.querySelector('video') as HTMLVideoElement | null;
    expect(video).toBeTruthy();
    expect(video?.getAttribute('src') || video?.src).toContain('/uploads/video/expl.mp4');
    expect(video?.autoplay).toBe(false);
    expect(video?.getAttribute('autoplay')).toBeNull();
    expect(video?.controls).toBe(true);
    expect(video?.getAttribute('data-listen-armed')).toBe('1');
    expect(document.querySelector('.stage-center')?.getAttribute('data-stage-reveal')).toBe('1');
    expect(document.querySelector('.stage-center')?.getAttribute('data-stage-swap')).toBe(
      'explanation',
    );
  });

  it('explanation video play/pause notifies like listen media', () => {
    let play = 0;
    let stop = 0;
    ctrl.notifyListenMediaPlay = () => {
      play += 1;
    };
    ctrl.notifyListenMediaEnded = () => {
      stop += 1;
    };
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({
        explanationText: '',
        explanationImageUrl: null,
        explanationVideoUrl: '/uploads/video/expl.mp4',
      }),
      true,
    );
    const video = dom.stageExplanationVideo?.querySelector('video');
    expect(video).toBeTruthy();
    video?.dispatchEvent(new Event('play'));
    expect(play).toBe(1);
    video?.dispatchEvent(new Event('pause'));
    expect(stop).toBe(1);
  });

  it('keeps question and media on reveal when there is no explanation', () => {
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({ explanationText: '', explanationImageUrl: null, imageUrl: TINY_GIF }),
      true,
    );
    expect(dom.stageQuestion?.style.display).not.toBe('none');
    expect(dom.stageQuestion?.textContent).toBe('2+2?');
    expect(dom.stageMedia?.style.display).not.toBe('none');
    expect(dom.stageMedia?.querySelector('img')?.getAttribute('src')).toBe(TINY_GIF);
    expect(document.querySelector('.stage-center')?.getAttribute('data-stage-swap')).toBeNull();
    expect(document.getElementById('stageExplanationLabel')?.style.display).toBe('none');
    expect(document.getElementById('stageExplanationLabel')?.getAttribute('data-stage-key')).toBeNull();
  });

  it('restores question and media after explanation is cleared', () => {
    renderStageQuestion(dom, ctrl, sampleQ({ imageUrl: TINY_GIF }), true);
    renderStageQuestion(dom, ctrl, sampleQ({ imageUrl: TINY_GIF }), false, 'question');
    expect(dom.stageQuestion?.style.display).not.toBe('none');
    expect(dom.stageMedia?.style.display).not.toBe('none');
    expect(document.querySelector('.stage-center')?.getAttribute('data-stage-swap')).toBeNull();
    expect(dom.stageMedia?.querySelector('img')?.getAttribute('src')).toBe(TINY_GIF);
  });

  it('omits img when only text', () => {
    renderStageQuestion(dom, ctrl, sampleQ({ explanationImageUrl: null }), true);
    expect(dom.stageExplanation?.textContent).toBe('Потому что');
    expect(dom.stageExplanationImage?.style.display).toBe('none');
    expect(dom.stageExplanationImage?.querySelector('img')).toBeNull();
    expect(dom.stageQuestion?.style.display).not.toBe('none');
    expect(dom.stageQuestion?.textContent).toBe('2+2?');
    expect(document.getElementById('stageExplanationLabel')?.style.display).toBe('none');
  });

  it('omits text when only image', () => {
    renderStageQuestion(dom, ctrl, sampleQ({ explanationText: '' }), true);
    expect(dom.stageExplanation?.style.display).toBe('none');
    expect(dom.stageExplanation?.getAttribute('data-stage-key')).toBeNull();
    expect(
      dom.stageExplanationImage?.querySelector('img.host-stage__explanation-img')?.getAttribute('src'),
    ).toBe(TINY_GIF);
    expect(dom.stageQuestion?.style.display).not.toBe('none');
    expect(dom.stageQuestion?.textContent).toBe('2+2?');
    expect(document.getElementById('stageExplanationLabel')?.style.display).toBe('none');
  });

  it('escapes explanation HTML', () => {
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({ explanationText: '<img onerror=alert(1)>', explanationImageUrl: null }),
      true,
    );
    const el = dom.stageExplanation!;
    expect(el.innerHTML).toContain('&lt;img');
    expect(el.querySelector('img')).toBeNull();
  });

  it('clears when question is null', () => {
    renderStageQuestion(dom, ctrl, sampleQ(), true);
    renderStageQuestion(dom, ctrl, null, true);
    const el = dom.stageExplanation!;
    expect(el.innerHTML.trim()).toBe('');
    expect(el.style.display).toBe('none');
    expect(dom.stageQuestion?.style.display).not.toBe('none');
    expect(document.querySelector('.stage-center')?.getAttribute('data-stage-swap')).toBeNull();
    expect(document.getElementById('stageExplanationLabel')?.style.display).toBe('none');
    expect(document.getElementById('stageExplanationLabel')?.getAttribute('data-stage-key')).toBeNull();
  });

  it('does not throw if stageExplanation is missing', () => {
    dom.stageExplanation = null;
    expect(() => renderStageQuestion(dom, ctrl, sampleQ(), true)).not.toThrow();
    expect(dom.stageAnswers?.childNodes.length).toBeGreaterThan(0);
  });

  it('keeps matching answers in the stage answers slot', () => {
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({
        type: 'matching',
        options: [],
        match: {
          left: [
            { id: 'l1', label: 'A' },
            { id: 'l2', label: 'B' },
          ],
          right: [
            { id: 'r1', label: '1' },
            { id: 'r2', label: '2' },
          ],
          correct: [0, 1],
        },
      }),
      false,
      'question',
    );
    expect(dom.stageAnswers?.className).toContain('host-stage__answers');
    expect(dom.stageAnswers?.className).toContain('host-stage__match');
    expect(dom.stageMeta?.textContent).toBe('Установите соответствие');
    expect(dom.stageMeta?.style.display).not.toBe('none');
  });

  it('shows «Варианты ответа» for text options', () => {
    renderStageQuestion(dom, ctrl, sampleQ(), false, 'question');
    expect(dom.stageMeta?.textContent).toBe('Варианты ответа');
    expect(dom.stageMeta?.style.display).not.toBe('none');
    expect(dom.stageAnswers?.dataset.count).toBe('2');
  });

  it('hides meta for visual options', () => {
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({
        options: [
          { id: 'o1', label: '4', imageUrl: TINY_GIF },
          { id: 'o2', label: '5', imageUrl: TINY_GIF },
        ],
      }),
      false,
      'question',
    );
    expect(dom.stageMeta?.textContent).toBe('');
    expect(dom.stageMeta?.style.display).toBe('none');
  });

  it('hides meta for text_input', () => {
    renderStageQuestion(dom, ctrl, sampleQ({ type: 'text_input', options: [] }), false, 'question');
    expect(dom.stageMeta?.textContent).toBe('');
    expect(dom.stageMeta?.style.display).toBe('none');
  });

  it('reveals only the first text answer on stage', () => {
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({
        type: 'text_input',
        options: [],
        correctTexts: ['Альбус Дамблдор', 'Дамблдор', 'Альбус'],
      }),
      true,
      'answer_reveal',
    );
    const items = [...(dom.stageAnswers?.querySelectorAll('.stage-correct-texts-item') || [])];
    expect(dom.stageAnswers?.querySelector('.stage-correct-texts-title')?.textContent).toBe(
      'Правильный ответ:',
    );
    expect(items.map((n) => n.textContent)).toEqual(['Альбус Дамблдор']);
  });

  it('does not clear reveal meta for visual options', () => {
    if (dom.stageMeta) {
      dom.stageMeta.textContent = 'Правильный ответ';
      dom.stageMeta.style.display = '';
    }
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({
        options: [
          { id: 'o1', label: '4', imageUrl: TINY_GIF },
          { id: 'o2', label: '5', imageUrl: TINY_GIF },
        ],
      }),
      true,
      'answer_reveal',
    );
    expect(dom.stageMeta?.textContent).toBe('Правильный ответ');
    expect(dom.stageMeta?.style.display).not.toBe('none');
  });

  it('shows image hide overlay on question and hides it on reveal', () => {
    const q = sampleQ({
      imageUrl: TINY_GIF,
      imageHideRect: { x: 10, y: 15, w: 20, h: 25 },
    });
    renderStageQuestion(dom, ctrl, q, false, 'question');
    const wrap = dom.stageMedia?.querySelector('.stage-media__hide-wrap');
    const rect = dom.stageMedia?.querySelector('.stage-media__hide-rect') as HTMLElement | null;
    expect(wrap).toBeTruthy();
    expect(rect).toBeTruthy();
    expect(rect?.style.left).toBe('10%');
    expect(rect?.style.top).toBe('15%');
    expect(rect?.style.width).toBe('20%');
    expect(rect?.style.height).toBe('25%');

    renderStageQuestion(dom, ctrl, q, false, 'question_read');
    expect(dom.stageMedia?.querySelector('.stage-media__hide-rect')).toBeTruthy();

    renderStageQuestion(dom, ctrl, q, false, 'answer_reveal');
    expect(dom.stageMedia?.querySelector('.stage-media__hide-rect')).toBeNull();
    expect(dom.stageMedia?.querySelector('img')).toBeTruthy();

    renderStageQuestion(dom, ctrl, q, true, 'question');
    expect(dom.stageMedia?.querySelector('.stage-media__hide-rect')).toBeNull();
  });

  it('shows several hide overlays on the same image', () => {
    const q = sampleQ({
      imageUrl: TINY_GIF,
      imageHideRects: [
        { x: 10, y: 15, w: 20, h: 25 },
        { x: 50, y: 40, w: 18, h: 12 },
      ],
    });
    renderStageQuestion(dom, ctrl, q, false, 'question');
    expect(dom.stageMedia?.querySelectorAll('.stage-media__hide-rect')).toHaveLength(2);
  });

  it('shows listen audio with answers, not during read or reveal', () => {
    const q = sampleQ({
      explanationText: '',
      explanationImageUrl: null,
      audioUrl: 'https://x/clip.mp3',
    });
    renderStageQuestion(dom, ctrl, q, false, 'question_read');
    expect(dom.stageMedia?.querySelector('audio')).toBeNull();
    expect(dom.stageAnswers?.querySelector('.stage-answer')).toBeNull();

    renderStageQuestion(dom, ctrl, q, false, 'question');
    expect(dom.stageMedia?.querySelector('audio')?.getAttribute('src')).toBe('https://x/clip.mp3');
    expect(dom.stageAnswers?.textContent).toContain('4');

    renderStageQuestion(dom, ctrl, q, true, 'answer_reveal');
    expect(dom.stageMedia?.querySelector('audio')).toBeNull();
    expect(dom.stageAnswers?.textContent).toContain('4');
  });

  it('shows listen video with answers, not during read', () => {
    const q = sampleQ({
      explanationText: '',
      explanationImageUrl: null,
      videoUrl: 'https://x/clip.mp4',
    });
    renderStageQuestion(dom, ctrl, q, false, 'question_read');
    expect(dom.stageMedia?.querySelector('video')).toBeNull();

    renderStageQuestion(dom, ctrl, q, false, 'question');
    const video = dom.stageMedia?.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.autoplay).toBe(false);
    expect(video?.controls).toBe(true);
  });

  it('notifies when listen audio ends', () => {
    let ended = 0;
    ctrl.notifyListenMediaEnded = () => {
      ended += 1;
    };
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({
        explanationText: '',
        explanationImageUrl: null,
        audioUrl: 'https://x/clip.mp3',
      }),
      false,
      'question',
    );
    const audio = dom.stageMedia?.querySelector('audio');
    expect(audio).toBeTruthy();
    audio?.dispatchEvent(new Event('ended'));
    expect(ended).toBe(1);
  });

  it('notifies stop when listen audio is paused after play', () => {
    let play = 0;
    let stop = 0;
    ctrl.notifyListenMediaPlay = () => {
      play += 1;
    };
    ctrl.notifyListenMediaEnded = () => {
      stop += 1;
    };
    renderStageQuestion(
      dom,
      ctrl,
      sampleQ({
        explanationText: '',
        explanationImageUrl: null,
        audioUrl: 'https://x/clip.mp3',
      }),
      false,
      'question',
    );
    const audio = dom.stageMedia?.querySelector('audio');
    expect(audio).toBeTruthy();
    audio?.dispatchEvent(new Event('play'));
    expect(play).toBe(1);
    audio?.dispatchEvent(new Event('pause'));
    expect(stop).toBe(1);
  });
});
