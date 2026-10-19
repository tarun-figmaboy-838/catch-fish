(function (PopoGame) {
'use strict';
const { FISH_ATLAS, FISH_NATURAL_ATLAS } = PopoGame;

const TITLE = PopoGame.TITLE_DATA || 'assets/backgrounds/title.webp';
const PLAY = PopoGame.PLAY_DATA || 'assets/sprites/play.webp';
const BACKGROUNDS = PopoGame.BACKGROUND_DATA || [1, 2, 3, 4].map((n) => `assets/backgrounds/location-${n}.webp`);

const assets = {
  backgrounds: [],
  fish: null,
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

async function loadCoreAssets() {
  const [popo, operating, winch, rope, connector, net, rowCycle, fish, naturalFish, bg0, props, title, play] = await Promise.all([
    loadImage('assets/generated/popo.png'),
    loadImage('assets/generated/popo-operating.png'),
    loadImage('assets/generated/winch-arched.png'),
    loadImage('assets/generated/rope.png'),
    loadImage('assets/generated/rope-connector.png'),
    loadImage('assets/generated/net.png'),
    loadImage('assets/sprites/popo-row-cycle.webp'),
    loadImage('assets/sprites/fish.webp'),
    loadImage('assets/sprites/fish-natural.webp'),
    preloadBackground(0),
    loadImage('assets/sprites/popo-props.webp'),
    loadImage(TITLE),
    loadImage(PLAY),
  ]);
  assets.popoPolished = popo;
  assets.popoOperating = operating;
  assets.winchPolished = winch;
  assets.rope = rope;
  assets.ropeConnector = connector;
  assets.netPolished = net;
  assets.rowCycle = rowCycle;
  assets.title = title;
  assets.play = play;
  assets.props = props;
  assets.fish = { img: fish, boxes: FISH_ATLAS.boxes };
  assets.naturalFish = { img: naturalFish, boxes: FISH_NATURAL_ATLAS.boxes, scale: FISH_NATURAL_ATLAS.scale };
  preloadBackground(1);
  return bg0;
}

Object.assign(PopoGame, { assets, preloadBackground, loadCoreAssets });
})(window.PopoGame = window.PopoGame || {});
