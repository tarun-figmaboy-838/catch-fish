(function (PopoGame) {
'use strict';

// The world is designed in a fixed 1672x941 logical space (the background's native size)
// and scaled to fit the viewport. Everything in the game thinks in logical pixels.
const STAGE_W = 1672;
const STAGE_H = 941;
// The paintings have their waterline 41% down. The net puzzle needs the sky, so they are drawn
// this much lower (the water pass extends the sky above them), putting the water at about 60%.
const SCENE_SHIFT = 170;
const SEABED_Y = 805 + SCENE_SHIFT;

class Stage {
  constructor(root, canvas) {
    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // the end screen's iris and sunburst, over the scene (which it can pan) and under the HUD
    this.curtain = document.getElementById('curtain');
    this.curtainCtx = this.curtain.getContext('2d');
    this.scale = 1;
    this.dpr = 1;
    this.portrait = false;
    this.resize();
  }

  resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.portrait = vh > vw * 1.15;
    const scale = Math.min(vw / STAGE_W, vh / STAGE_H);
    const w = Math.round(STAGE_W * scale);
    const h = Math.round(STAGE_H * scale);
    this.scale = scale;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.root.style.width = `${w}px`;
    this.root.style.height = `${h}px`;
    this.root.style.setProperty('--scale', scale);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.curtain.width = this.canvas.width;
    this.curtain.height = this.canvas.height;
    this.curtain.style.width = `${w}px`;
    this.curtain.style.height = `${h}px`;
  }

  // Resets the transform so drawing code can use logical coordinates.
  begin() {
    const k = this.dpr * this.scale;
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    return this.ctx;
  }

  beginCurtain() {
    const k = this.dpr * this.scale;
    this.curtainCtx.setTransform(k, 0, 0, k, 0, 0);
    return this.curtainCtx;
  }

  toStage(clientX, clientY) {
    const r = this.root.getBoundingClientRect();
    return { x: (clientX - r.left) / this.scale, y: (clientY - r.top) / this.scale };
  }
}

// The raft's middle at the waterline: room for Popo, his bucket and the winch, with the net
// hanging clear of the machine's mast.
function raftAnchor(waterline) {
  return { x: 240, y: waterline + 12 };
}

Object.assign(PopoGame, { STAGE_W, STAGE_H, SCENE_SHIFT, SEABED_Y, Stage, raftAnchor });
})(window.PopoGame = window.PopoGame || {});
