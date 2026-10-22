(function (PopoGame) {
'use strict';
const { FISH_NATURAL_ATLAS } = PopoGame;

const TITLE = PopoGame.TITLE_DATA || 'assets/backgrounds/title.webp';
const PLAY = PopoGame.PLAY_DATA || 'assets/sprites/play.webp';
const BACKGROUNDS = PopoGame.BACKGROUND_DATA || [1, 2, 3, 4].map((n) => `assets/backgrounds/location-${n}.webp`);

const assets = {
  backgrounds: [],
  naturalFish: null,
};

const pending = new Map();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

// Each background comes with a water mask (white where the surface waves may move it).
const WATER_MASKS = PopoGame.WATER_MASKS || [1, 2, 3, 4].map((n) => `assets/backgrounds/water-${n}.png`);

function preloadBackground(index) {
  if (!pending.has(index)) {
    pending.set(index, Promise.all([loadImage(BACKGROUNDS[index]), loadImage(WATER_MASKS[index])]).then(([img, mask]) => {
      img.waterMask = mask;
      assets.backgrounds[index] = img;
      return img;
    }, (err) => {
      pending.delete(index); // let the next attempt try again
      throw err;
    }));
  }
  return pending.get(index);
}

// The generated art (assets/generated/, used whole) as the WebP copies tools/build-assets.py
// makes of it: the same pictures, a fifth of the download.
const generated = (name) => loadImage(`assets/generated-web/${name}.webp`);

async function loadCoreAssets() {
  const [operating, winch, rope, connector, net, rowCycle, naturalFish, bg0, props, title, play] = await Promise.all([
    generated('popo-operating'),
    generated('winch-arched'),
    generated('rope'),
    generated('rope-connector'),
    generated('net'),
    loadImage('assets/sprites/popo-row-cycle.webp'),
    loadImage('assets/sprites/fish-natural.webp'),
    preloadBackground(0),
    loadImage('assets/sprites/popo-props.webp'),
    loadImage(TITLE),
    loadImage(PLAY),
  ]);
  assets.popoOperating = operating;
  assets.winchPolished = winch;
  assets.rope = rope;
  assets.ropeConnector = connector;
  assets.netPolished = net;
  assets.rowCycle = rowCycle;
  assets.title = title;
  assets.play = play;
  assets.props = props;
  assets.naturalFish = { img: naturalFish, boxes: FISH_NATURAL_ATLAS.boxes, scale: FISH_NATURAL_ATLAS.scale };
  preloadBackground(1);
  // the pause and final cards' panel (a CSS background) loads now, in the background, so the
  // first pause never shows a card without its frame
  loadImage('assets/generated/panel.png').catch(() => {});
  return bg0;
}

Object.assign(PopoGame, { assets, preloadBackground, loadCoreAssets });
})(window.PopoGame = window.PopoGame || {});
