// Touch screens and game controllers. Both drive the same inputs as the keyboard and mouse:
// buttons send the same key / mouse events the game already listens for, the sticks move and
// aim the player directly. The game works without pointer lock in these modes.

const keyEvent = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
const mouseEvent = (type, button) => document.dispatchEvent(new MouseEvent(type, { button, bubbles: true }));
const tap = (code) => {
  keyEvent('keydown', code);
  keyEvent('keyup', code);
};

// On-screen buttons: [id, label, action]. Actions: key:<code> (tap), hold:<code>, mouse:<button>, or a named action.
const BUTTONS = [
  ['fire', '🔥', 'mouse:0'],
  ['aim', '🎯', 'mouse:2'],
  ['jump', '⤒', 'hold:Space'],
  ['crouch', '⤓', 'hold:KeyC'],
  ['reload', 'R', 'key:KeyR'],
  ['swap', '⇄', 'swap'],
  ['knife', '🔪', 'key:KeyV'],
  ['nade', '💣', 'key:KeyG'],
  ['build', '🧱', 'key:KeyB'],
  ['pause', 'II', 'pause'],
  ['chat', '💬', 'key:KeyT'],
  ['scores', '☰', 'hold:Tab'],
];

export class Controls {
  // ctx: { player, weapon, canPlay(), playing(), pause(), resume(), look(dx, dy), inMatch(), building() }
  constructor(ctx) {
    this.ctx = ctx;
    this.mode = matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window ? 'touch' : 'mouse';
    this.root = document.getElementById('touch');
    this.stickTouch = null;
    this.lookTouch = null;
    this.held = new Map(); // touch id -> button
    this.padPrev = [];
    this.padLook = { x: 0, y: 0 };
    this.sens = 1;
    this._buildTouch();
    // whatever was used last decides the mode
    // (a tap also fires mouse events; those don't count)
    window.addEventListener('mousemove', (e) => {
      if ((e.movementX || e.movementY) && performance.now() - this.lastTouch > 1000) this.setMode('mouse');
    });
    window.addEventListener('keydown', (e) => {
      if (e.isTrusted) this.setMode('mouse');
    });
    this.lastTouch = -1e9;
    window.addEventListener(
      'touchstart',
      () => {
        this.lastTouch = performance.now();
        this.setMode('touch');
      },
      { passive: true },
    );
    this.setMode(this.mode);
  }

  get pointerFree() {
    return this.mode !== 'mouse';
  }

  setMode(mode) {
    if (this.mode === mode && this._applied) return;
    this.mode = mode;
    this._applied = true;
    document.body.classList.toggle('touch-mode', mode === 'touch');
    document.body.classList.toggle('pad-mode', mode === 'pad');
  }

  // ---------------------------------------------------------------- touch
  _buildTouch() {
    const r = this.root;
    r.innerHTML = `<div class="t-stick hidden"><i></i></div>${BUTTONS.map(([id, label]) => `<button class="t-btn t-${id}" data-b="${id}">${label}</button>`).join('')}`;
    this.stickEl = r.querySelector('.t-stick');
    this.knob = this.stickEl.querySelector('i');
    const opts = { passive: false };
    r.addEventListener('touchstart', (e) => this._touchStart(e), opts);
    r.addEventListener('touchmove', (e) => this._touchMove(e), opts);
    r.addEventListener('touchend', (e) => this._touchEnd(e), opts);
    r.addEventListener('touchcancel', (e) => this._touchEnd(e), opts);
  }

  _press(id, down) {
    const def = BUTTONS.find((b) => b[0] === id);
    if (!def) return;
    const [kind, arg] = def[2].split(':');
    if (kind === 'mouse') mouseEvent(down ? 'mousedown' : 'mouseup', Number(arg));
    else if (kind === 'hold') keyEvent(down ? 'keydown' : 'keyup', arg);
    else if (!down) return;
    else if (kind === 'key') tap(arg);
    else if (kind === 'swap') {
      // in build mode it switches between barricade and turret
      if (this.ctx.building()) tap((this._bk = this._bk === 'Digit2' ? 'Digit1' : 'Digit2'));
      else this.ctx.weapon.cycle(1);
    }
    else if (kind === 'pause') this.ctx.pause();
  }

  _touchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const btn = t.target.closest?.('.t-btn');
      if (btn) {
        this.held.set(t.identifier, { id: btn.dataset.b, x: t.clientX, y: t.clientY });
        btn.classList.add('down');
        this._press(btn.dataset.b, true);
        continue;
      }
      if (t.clientX < window.innerWidth * 0.42 && !this.stickTouch) {
        // movement stick appears where your thumb lands
        this.stickTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
        this.stickEl.classList.remove('hidden');
        this.stickEl.style.left = `${t.clientX}px`;
        this.stickEl.style.top = `${t.clientY}px`;
        this.knob.style.transform = 'translate(-50%, -50%)';
      } else if (!this.lookTouch) {
        this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }
  }

  _touchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.stickTouch && t.identifier === this.stickTouch.id) {
        const R = 55;
        let dx = t.clientX - this.stickTouch.x;
        let dy = t.clientY - this.stickTouch.y;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          dx *= R / d;
          dy *= R / d;
        }
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.ctx.player.stick.x = dx / R;
        this.ctx.player.stick.y = -dy / R;
        continue;
      }
      // dragging on the right side (or while holding fire) turns you
      const held = this.held.get(t.identifier);
      const look = this.lookTouch && t.identifier === this.lookTouch.id ? this.lookTouch : held && held.id === 'fire' ? held : null;
      if (look) {
        this.ctx.look((t.clientX - look.x) * 2.2 * this.sens, (t.clientY - look.y) * 2.2 * this.sens);
        look.x = t.clientX;
        look.y = t.clientY;
      }
    }
  }

  _touchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const held = this.held.get(t.identifier);
      if (held) {
        this.held.delete(t.identifier);
        this.root.querySelector(`.t-${held.id}`)?.classList.remove('down');
        this._press(held.id, false);
      }
      if (this.stickTouch && t.identifier === this.stickTouch.id) {
        this.stickTouch = null;
        this.stickEl.classList.add('hidden');
        this.ctx.player.stick.x = 0;
        this.ctx.player.stick.y = 0;
      }
      if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
    }
  }

  // Lets go of everything (pausing, dying, leaving).
  releaseAll() {
    for (const [, h] of this.held) {
      this.root.querySelector(`.t-${h.id}`)?.classList.remove('down');
      this._press(h.id, false);
    }
    this.held.clear();
    this.stickTouch = this.lookTouch = null;
    this.stickEl.classList.add('hidden');
    this.ctx.player.stick.x = 0;
    this.ctx.player.stick.y = 0;
  }

  // Show the touch buttons only while playing; some only when they make sense.
  updateTouchUi(playing) {
    const show = this.mode === 'touch' && playing;
    this.root.classList.toggle('hidden', !show);
    if (!show) return;
    this.root.querySelector('.t-chat').classList.toggle('hidden', !this.ctx.inMatch());
    this.root.querySelector('.t-scores').classList.toggle('hidden', !this.ctx.inMatch());
    this.root.classList.toggle('building', this.ctx.building());
  }

  // ---------------------------------------------------------------- gamepad (standard mapping)
  // A jump · B crouch/slide · X reload · Y swap · LB grenade · RB knife · LT aim · RT fire
  // L3 sprint · R3 knife · D-pad up build, down last gun, left/right pick what to build
  // Start pause/resume · Back scores. In menus: D-pad moves between buttons, A presses.
  update(dt) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const pad = pads[0];
    if (!pad) return;
    const b = pad.buttons.map((x) => x.pressed || x.value > 0.4);
    const ax = pad.axes;
    const dead = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    const used = b.some(Boolean) || ax.some((v) => Math.abs(v) > 0.3);
    if (used) this.setMode('pad');
    if (this.mode !== 'pad') {
      this.padPrev = b;
      return;
    }
    const was = (i) => this.padPrev[i];
    const pressed = (i) => b[i] && !was(i);
    const released = (i) => !b[i] && was(i);
    const hold = (i, code) => {
      if (pressed(i)) keyEvent('keydown', code);
      if (released(i)) keyEvent('keyup', code);
    };
    const playing = this.ctx.playing();

    if (playing) {
      const p = this.ctx.player;
      p.stick.x = dead(ax[0] || 0);
      p.stick.y = -dead(ax[1] || 0);
      // right stick: turn faster the further you push it
      const lx = dead(ax[2] || 0);
      const ly = dead(ax[3] || 0);
      const speed = 900 * dt * this.sens;
      if (lx || ly) this.ctx.look(lx * Math.abs(lx) * speed, ly * Math.abs(ly) * speed * 0.7);
      hold(0, 'Space');
      hold(1, 'KeyC');
      if (pressed(2)) tap('KeyR');
      if (pressed(3)) this.ctx.weapon.cycle(1);
      if (pressed(4)) tap('KeyG');
      if (pressed(5) || pressed(11)) tap('KeyV');
      if (pressed(6)) mouseEvent('mousedown', 2);
      if (released(6)) mouseEvent('mouseup', 2);
      if (pressed(7)) mouseEvent('mousedown', 0);
      if (released(7)) mouseEvent('mouseup', 0);
      hold(10, 'ShiftLeft');
      if (pressed(12)) tap('KeyB');
      if (pressed(13)) tap(this.ctx.building() ? 'KeyR' : 'KeyQ');
      if (pressed(14)) tap('Digit1');
      if (pressed(15)) tap('Digit2');
      hold(8, 'Tab');
      if (pressed(9)) this.ctx.pause();
    } else {
      this.ctx.player.stick.x = this.ctx.player.stick.y = 0;
      if (this.ctx.choosing()) {
        // power-up cards: D-pad left / up / right, or X / Y / B
        if (pressed(14) || pressed(2)) tap('Digit1');
        if (pressed(12) || pressed(3)) tap('Digit2');
        if (pressed(15) || pressed(1)) tap('Digit3');
      } else {
        if (pressed(12) || pressed(14)) this._focusMove(-1);
        if (pressed(13) || pressed(15)) this._focusMove(1);
        if (pressed(0)) {
          const el = document.activeElement;
          if (el && el.tagName === 'BUTTON' && el.offsetParent) el.click();
          else this.ctx.resume();
        }
        if (pressed(9)) this.ctx.resume();
        if (pressed(1)) {
          // B: close the open window, or "back" on a screen
          const modal = document.querySelector('#account-modal:not(.hidden) [data-close]');
          if (modal) modal.click();
          else [...document.querySelectorAll('.overlay:not(.hidden) .btn.ghost')].find((x) => x.offsetParent)?.click();
        }
      }
    }
    this.padPrev = b;
  }

  // D-pad through the buttons on whatever screen is showing
  _focusMove(dir) {
    const scope = document.querySelector('#account-modal:not(.hidden)') || [...document.querySelectorAll('.overlay')].find((o) => !o.classList.contains('hidden'));
    if (!scope) return;
    const all = [...scope.querySelectorAll('button')].filter((x) => x.offsetParent && !x.disabled);
    // the big buttons first, then the small ones
    const list = [...all.filter((x) => x.classList.contains('btn')), ...all.filter((x) => !x.classList.contains('btn'))];
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = list[(i + dir + list.length) % list.length] || list[0];
    next.focus();
  }
}
