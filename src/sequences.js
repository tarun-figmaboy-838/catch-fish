(function (PopoGame) {
'use strict';
const { clock, ease, Cancelled, state, PHASE, newToken, isCurrent, Fish, STORY, LEVELS, NATURAL_FISH, STAGE_W } = PopoGame;

function swallow(e) {
  if (!(e instanceof Cancelled)) throw e;
}

const between = (a, b) => a + Math.random() * (b - a);
// a different fish each time, in a random order
const shuffled = (list) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

// --- the opening ---------------------------------------------------------------
// Before the first line, a cartoon entrance: Popo zooms in rowing flat out (honk honk!), slams
// on the brakes with a screech, overshoots and springs back boing-boing, and in a poof the
// paddle is gone and his paws are on the winch's crank (ta-da!).
async function popoArrives(game, token) {
  const { popo, fx, audio } = game;
  const reduced = fx.reduced;
  const from = -620;
  const overshoot = reduced ? 0 : 110;
  const stroke = 520; // frantic paddling
  const raftFront = () => popo.raftEnds().right + popo.travelShift;
  popo.travelShift = from;
  popo.startRowing(stroke);
  try {
    await clock.wait(120, token);
    audio.play('honk');
    audio.play('whoosh');
    audio.setTravel(true);
    let lastBlade = popo.paddleTip();
    let lastWake = 0;
    // a fish or two flee ahead of the speeding raft and leap out of its way
    if (!reduced) {
      shuffled(NATURAL_FISH).slice(0, Math.random() < 0.4 ? 1 : 2).forEach((key, i) => {
        clock.wait(i * 260, token).then(() => jump(game, token, key, between(430, 520) + i * 110, 1,
          { height: between(120, 170), ms: between(650, 800), scale: between(0.55, 0.7), speed: between(720, 840) })).catch(() => {});
      });
    }
    const zoom = reduced ? 1300 : 1500;
    await clock.tween(zoom, token, (t) => {
      const elapsed = t * zoom;
      popo.travelShift = from + (overshoot - from) * (t < 0.15 ? (t * t) / 0.3 : t - 0.075) / 0.925;
      popo.setRowingTime(elapsed);
      popo.tilt = -0.03 - popo.rowRig.sample(elapsed, stroke).power * 0.03; // leaning into it
      const blade = popo.paddleTip();
      if (lastBlade && blade && lastBlade.y < game.waterline && blade.y >= game.waterline) {
        const crossing = (game.waterline - lastBlade.y) / (blade.y - lastBlade.y);
        fx.splash(lastBlade.x + (blade.x - lastBlade.x) * crossing, game.waterline, false);
        audio.play('paddle');
      }
      lastBlade = blade;
      if (elapsed - lastWake > 160) {
        lastWake = elapsed;
        const stern = popo.raftEnds().left + popo.travelShift;
        fx.ripple(stern - 12, game.waterline + 6, 0.9);
        if (stern > 0) fx.splash(stern - 6, game.waterline, false); // spray kicked up behind
        fx.splash(stern + 340, game.waterline, false); // and off the bow
      }
    });
    audio.setTravel(false);
    const held = popo.rowing.time;
    if (overshoot) {
      // brakes! the raft screeches past the spot, squashing up in a fan of spray; fish swim
      // over to see what the fuss is about
      fishSaysHello(game, token);
      audio.play('skid');
      audio.play('woah');
      let lastSpray = 0;
      await clock.tween(520, token, (t) => {
        popo.travelShift = overshoot + 34 * Math.sin(t * Math.PI / 2);
        popo.tilt = 0.12 * Math.sin(t * Math.PI);
        popo.squash = 0.12 * Math.sin(t * Math.PI);
        popo.setRowingTime(held);
        if (t - lastSpray > 0.18) { lastSpray = t; fx.splash(raftFront() + 10, game.waterline, true); }
      });
      // ...and springs back onto it, boing-boing
      audio.play('boing');
      const back = overshoot + 34;
      let boinged = false;
      await clock.tween(820, token, (t) => {
        popo.travelShift = back * (1 - ease.outBack(t));
        popo.tilt = -Math.sin(t * Math.PI * 3) * 0.08 * (1 - t);
        popo.squash = -Math.sin(t * Math.PI * 3) * 0.1 * (1 - t);
        popo.setRowingTime(held);
        if (!boinged && t > 0.45) { boinged = true; audio.play('boing'); }
      });
    }
    popo.squash = 0;
    popo.tilt = 0;
    // ta-da: a poof, and the paddle has turned into the crank handle
    const head = popo.headTop();
    game.poof = { x: head.x + 30, y: head.y + 120, t: 0 };
    audio.play('poof');
    await clock.wait(130, token); // the swap happens inside the cloud
  } finally {
    // however the entrance ends (even cancelled by a restart), Popo is left sitting on his spot
    popo.idle();
    popo.travelShift = 0;
    popo.tilt = 0;
    popo.squash = 0;
    if (isCurrent(token)) audio.setTravel(false);
  }
  audio.play('tada');
  fx.sparkle(popo.headTop().x + 40, popo.headTop().y + 50, 18);
  await clock.wait(380, token);
  // a happy hop while the fish leap around him
  game.storyCue('hop');
  await clock.wait(900, token);
}

// One fish swims in from the edge of the water (from the left or right), leaps out with a
// splash each way, and swims on out of view on the other side.
async function jump(game, token, key, x0, dir, { height = 190, ms = 900, scale = 0.7, speed = 600 } = {}) {
  const { fx, audio } = game;
  const wl = game.waterline;
  const surface = wl + 30;
  const depth = wl + 110 + Math.random() * 70;
  const enterX = dir > 0 ? -80 : STAGE_W + 80;
  const exitX = dir > 0 ? STAGE_W + 80 : -80;
  const dx = speed * (ms / 1000) * 0.45; // the leap carries its run-up speed
  const fish = new Fish(key, enterX, depth, dir, scale);
  game.leapers.push(fish);
  let out = false;
  let back = false;
  let rippled = false;
  let lastBubble = 0;
  try {
    await clock.tween(Math.abs(x0 - enterX) / speed * 1000, token, (t) => {
      fish.x = enterX + (x0 - enterX) * t;
      const rise = Math.max(0, (t - 0.6) / 0.4); // swims level, then up toward the surface
      fish.y = depth + (surface - depth) * rise * rise;
      fish.pitch = -0.5 * rise;
      if (t - lastBubble > 0.15) { lastBubble = t; fx.puff(fish.x - dir * fish.w * 0.45, fish.y, -dir, 1); }
      if (!rippled && t > 0.9) { rippled = true; fx.ripple(x0, wl, 0.7); }
    });
    audio.play('leap');
    await clock.tween(ms, token, (t) => {
      fish.x = x0 + dir * dx * t;
      fish.y = surface - height * 4 * t * (1 - t);
      fish.pitch = Math.max(-0.8, Math.min(0.8, -(1 - 2 * t) * 0.9));
      if (!out && fish.y < wl) { out = true; fx.splash(fish.x, wl, false); audio.play('splashSmall'); }
      if (out && !back && t > 0.5 && fish.y > wl) { back = true; fx.splash(fish.x, wl, true); audio.play('splashSmall'); }
    });
    const x1 = fish.x;
    await clock.tween(Math.abs(exitX - x1) / speed * 1000, token, (t) => {
      fish.x = x1 + (exitX - x1) * t;
      const dive = Math.min(1, t / 0.25);
      fish.y = surface + (depth - surface) * (1 - (1 - dive) ** 2);
      fish.pitch = 0.6 * (1 - dive);
    });
  } finally {
    game.leapers = game.leapers.filter((f) => f !== fish);
  }
}

// A few fish swim in from either side and leap for joy beside the raft, each at its own
// moment, size, height and speed, then swim away. They run on their own.
function fishSaysHello(game, token) {
  const raft = game.popo.raftEnds().right;
  const count = 3 + Math.floor(Math.random() * 2);
  const fish = shuffled(NATURAL_FISH);
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    at += between(100, 380);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x0 = between(raft + 150, raft + 640); // clear of the raft
    const opts = { height: between(110, 220), ms: between(700, 950), scale: between(0.55, 0.72), speed: between(560, 720) };
    clock.wait(at, token).then(() => jump(game, token, fish[i], x0, dir, opts)).catch(() => {});
  }
}

// The journey opens with the narrator; then the first school swims in and the net appears.
async function opening(game) {
  const token = newToken();
  try {
    state.phase = PHASE.INTRO;
    game.ui.setInstruction('');
    await popoArrives(game, token);
    for (const line of STORY.intro) await game.say(line, token);
    await firstPuzzle(game, token);
  } catch (e) {
    swallow(e);
  }
}

// Straight to the first net, without the story (Play Again).
async function startLevels(game) {
  const token = newToken();
  try {
    state.phase = PHASE.INTRO;
    await firstPuzzle(game, token);
  } catch (e) {
    swallow(e);
  }
}

async function firstPuzzle(game, token) {
  game.fishIn();
  await clock.wait(400, token);
  game.net.showSolved();
  await netAppears(game, token);
  await introduceNet(game, token);
  game.beginPuzzle();
}

// Every net arrives as a parallelogram: its two pairs of parallel sides light up (the
// narrator says why, the first time), then one corner slips out of place for the child to
// put right.
async function introduceNet(game, token) {
  const { net, popo, audio } = game;
  net.showPairs();
  if (state.level === 0) await game.say(STORY.rule, token);
  else await clock.wait(1000, token);
  audio.play('slip');
  popo.react('gasp', 0.8);
  const from = net.solved[net.movable];
  const to = net.start[net.movable];
  await clock.tween(480, token, (t) => {
    const k = ease.outBack(t);
    net.setHandle({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
  });
  net.points = net.start.map((p) => ({ ...p }));
}

// Popo lets the net down from the boom into its place: a little rope paid out, with a bounce.
async function netAppears(game, token) {
  const { net, winch, audio } = game;
  net.visible = true;
  net.alpha = 0;
  audio.play('bloop');
  await clock.tween(550, token, (t) => {
    net.alpha = Math.min(1, t * 2.5);
    winch.setRopeOut(-40 * (1 - ease.outBack(t)));
  });
  net.alpha = 1;
  winch.setRopeOut(0);
}

// --- the puzzle solved ------------------------------------------------------------
// The corner glides home and locks; the frame lights up, then its two pairs of parallel sides
// in turn; once every fish has swum in under the net, Drop Net is ready.
async function snapCorner(game) {
  const token = newToken();
  const { net, popo, audio, ui } = game;
  const level = LEVELS[state.level];
  try {
    state.phase = PHASE.SNAPPING;
    ui.showHandle(false);
    game.stopHint();
    const from = { ...net.points[net.movable] };
    const to = net.target;
    await clock.tween(260, token, (t) => {
      const k = ease.outBack(t);
      net.setHandle({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
    });
    net.solve();
    audio.play('snap');
    const snapped = net.toStage(net.target);
    game.fx.sparkle(snapped.x, snapped.y, 14);
    state.phase = PHASE.SHAPE_CORRECT;
    popo.react('happy', 1.2);
    await clock.wait(140, token);
    net.showPairs();
    audio.play('success');
    ui.setInstruction(level.praise);
    const spoken = game.speak(level.praise);
    await clock.wait(Math.max(1000, spoken * 1000 + 200), token);
    while (state.fish.some((f) => f.offstage || f.entering)) await clock.wait(100, token);
    state.phase = PHASE.DROP_READY;
    ui.setInstruction(STORY.drop);
    game.speak(STORY.drop);
    ui.setDrop('ready');
    audio.play('ready');
    popo.squash = 0.06; // a little bob of attention toward the machine
  } catch (e) {
    swallow(e);
  }
}

// --- the catch ------------------------------------------------------------------------
async function dropNet(game) {
  const token = newToken();
  const { net, winch, popo, fx, audio, ui } = game;
  const reduced = fx.reduced;
  try {
    state.phase = PHASE.NET_LOWERING;
    ui.setDrop('hidden');
    ui.setInstruction('');
    audio.stopVoice();
    popo.squash = 0.07; // Popo takes hold of the crank
    await clock.wait(200, token);

    const depth = game.catchDepth();
    const down = reduced ? 1000 : 1500;
    winch.working = 1;
    audio.crank(down / 1000);
    let splashed = false;
    let lastBubble = 0;
    await clock.tween(down, token, (t) => {
      const k = ease.inOut(t);
      winch.setRopeOut(depth * k);
      net.swing = reduced ? 0 : Math.sin(t * Math.PI * 2) * 0.012 * (1 - t);
      const bottom = net.ring().y + net.bottom();
      if (!splashed && bottom >= game.waterline) {
        splashed = true;
        game.netSplash();
      }
      if (splashed && t - lastBubble > 0.12) {
        lastBubble = t;
        const corner = net.toStage(net.points[Math.random() < 0.5 ? 2 : 3]);
        fx.puff(corner.x, corner.y, 0, 1);
      }
      game.herdFish();
    });
    net.swing = 0;
    winch.working = 0;

    // the frame settles around the school; each fish inside is netted in turn
    state.phase = PHASE.CATCHING;
    const caught = state.fish.filter((f) => !f.gone && net.contains(f));
    audio.play('bubbles');
    for (const f of caught) {
      f.catchAt(net.toNet(f));
      fx.puff(f.x, f.y, 0, 2, true);
      await clock.wait(70, token);
    }
    await clock.wait(reduced ? 250 : 420, token);

    state.phase = PHASE.NET_RAISING;
    const up = reduced ? 900 : 1300;
    winch.working = -1;
    audio.crank(up / 1000);
    let surfaced = false;
    await clock.tween(up, token, (t) => {
      winch.setRopeOut(depth * (1 - ease.inOut(t)));
      const bottom = net.ring().y + net.bottom();
      if (!surfaced && bottom < game.waterline) {
        surfaced = true;
        game.netSplash();
        audio.play('drip');
      }
      if (surfaced && Math.random() < 0.12) fx.drips(net.toStage(net.points[Math.random() < 0.5 ? 2 : 3]));
    });
    winch.setRopeOut(0);
    winch.working = 0;

    state.phase = PHASE.LEVEL_SUCCESS;
    state.caught += caught.length;
    popo.react('laugh', 1.6);
    audio.play('catch');
    const ring = net.ring();
    fx.sparkle(ring.x, ring.y + net.bottom() / 2, 16);
    for (const f of caught) f.wiggle();
    await game.say(STORY.catch, token);
    await collectFish(game, caught, token);
    await nextLevel(game, token);
  } catch (e) {
    swallow(e);
  }
}

// The netted fish hop into the bucket one after another, shrinking as they go.
async function collectFish(game, fish, token) {
  const { popo, fx, audio } = game;
  const flights = fish.map((f, i) => clock.wait(i * 110, token).then(() => {
    const from = { x: f.x, y: f.y };
    const bucket = popo.bucketPoint();
    const peak = { x: (from.x + bucket.x) / 2, y: Math.min(from.y, bucket.y) - 170 };
    f.caught = null;
    f.flying = true; // drawn in front of the raft on its way to the bucket
    f.dir = -1;
    return clock.tween(560, token, (t) => {
      const k = ease.inOut(t);
      f.x = (1 - k) * (1 - k) * from.x + 2 * (1 - k) * k * peak.x + k * k * bucket.x;
      f.y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * peak.y + k * k * bucket.y;
      f.scale = 1 - 0.55 * k;
    }).then(() => {
      f.gone = true;
      fx.sparkle(bucket.x, bucket.y - 10, 8);
      audio.play('collect');
      state.banked += 1;
      game.ui.setCaught(state.banked);
    });
  }));
  await Promise.all(flights);
}

// On to the next net: a row to new waters when the level moves on, the next school swimming
// in while the net takes its new shape. After the last net, the celebration.
async function nextLevel(game, token) {
  const next = state.level + 1;
  if (next >= LEVELS.length) {
    await celebrate(game, token);
    return;
  }
  state.phase = PHASE.TRANSITIONING;
  state.fish = [];
  game.audio.play('complete');
  await clock.wait(500, token);
  if (LEVELS[next].location !== state.locationIndex) await rowTo(game, LEVELS[next].location, token);
  const before = game.prepareLevel(next);
  game.spawnSchool();
  game.net.showSolved();
  await game.morphNet(before, token);
  await introduceNet(game, token);
  game.beginPuzzle();
}

async function rowTo(game, nextIndex, token) {
  const { popo, fx, audio, ui, net } = game;
  ui.setInstruction('Popo rows on…');
  try {
    await game.prepareTransition(nextIndex, token);
  } catch (e) {
    // the next scenery couldn't load: arrive without the row rather than get stuck
    if (!isCurrent(token)) throw new Cancelled();
    game.finishTransition(nextIndex);
    return;
  }
  audio.setTravel(true);
  const fromWater = game.waterline;
  const toWater = game.locationWaterline(nextIndex);
  const duration = fx.reduced ? 1800 : 3400;
  const stroke = duration / (fx.reduced ? 1 : 2);
  popo.startRowing(stroke);
  let lastBlade = popo.paddleTip();
  let lastSplashStroke = -1;
  let lastWake = 0;
  try {
    await clock.tween(duration, token, (t) => {
      const k = ease.inOut(t);
      game.transition.k = k;
      game.setWaterline(fromWater + (toWater - fromWater) * k);
      const elapsed = t * duration;
      popo.setRowingTime(elapsed);
      // every pull drives the raft forward and lifts the bow a little; it settles as the blade lifts
      const surge = popo.rowRig.sample(elapsed, stroke).power;
      const pace = Math.sin(t * Math.PI);
      popo.travelShift = pace * (18 + surge * 24);
      popo.tilt = -pace * (0.012 + surge * 0.014);
      net.swing = -pace * 0.04; // the net trails a little behind the moving raft
      const blade = popo.paddleTip();
      const strokeIndex = Math.floor(elapsed / stroke);
      if (strokeIndex !== lastSplashStroke && lastBlade.y < game.waterline && blade.y >= game.waterline) {
        lastSplashStroke = strokeIndex;
        const crossing = (game.waterline - lastBlade.y) / (blade.y - lastBlade.y);
        fx.splash(lastBlade.x + (blade.x - lastBlade.x) * crossing, game.waterline, false);
        audio.play('paddle');
      }
      lastBlade = blade;
      if (elapsed - lastWake > 380 && t > 0.06 && t < 0.94) {
        lastWake = elapsed;
        fx.ripple(popo.raftEnds().left + popo.travelShift - 12, game.waterline + 6, 0.7);
      }
    });
  } finally {
    popo.idle();
    popo.travelShift = 0;
    popo.tilt = 0;
    net.swing = 0;
    if (isCurrent(token)) audio.setTravel(false);
  }
  game.finishTransition(nextIndex);
  await clock.wait(250, token);
}

// After the sixth net: Popo cheers, and the final card says what was learned.
async function celebrate(game, token) {
  const { popo, fx, audio, ui, net } = game;
  state.phase = PHASE.GAME_COMPLETE;
  ui.setInstruction('');
  audio.play('tada');
  popo.react('laugh', 2.2);
  const ring = net.ring();
  for (let i = 0; i < 4; i += 1) {
    clock.wait(i * 180, token).then(() => {
      fx.sparkle(ring.x + (Math.random() - 0.5) * 400, ring.y + 60 + Math.random() * 160, 10);
    }).catch(() => {});
  }
  await game.say(STORY.complete, token);
  await clock.wait(200, token);
  ui.showComplete(true, STORY.made, STORY.lesson);
  game.announceComplete();
  const spoken = game.speak(STORY.made);
  await clock.wait(Math.max(1200, spoken * 1000 + 250), token);
  game.speak(STORY.lesson);
}

Object.assign(PopoGame, { opening, startLevels, snapCorner, dropNet, rowTo, celebrate });
})(window.PopoGame = window.PopoGame || {});
