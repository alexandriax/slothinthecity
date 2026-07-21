export const ZOO_SIDE_QUEST_IDS = [
  "aviary-voices",
  "sea-lion-current",
  "monkey-canopy-rig",
  "zebra-stripe-scan",
  "red-panda-scent-wind",
  "tortoise-sun-trail",
  "flamingo-wetland-balance",
  "bison-prairie-seeding",
] as const;

export type ZooSideQuestId = typeof ZOO_SIDE_QUEST_IDS[number];

export type ZooRecruitSpeciesId =
  | "sun-conure"
  | "blue-and-gold-macaw"
  | "scarlet-ibis"
  | "green-aracari"
  | "california-sea-lion"
  | "spider-monkey"
  | "plains-zebra"
  | "red-panda"
  | "aldabra-tortoise"
  | "american-flamingo"
  | "american-bison";

export type ZooSideQuestMetadata = {
  id: ZooSideQuestId;
  eyebrow: string;
  title: string;
  objective: string;
  instructions: string;
  keyboard: string;
  recruitedSpecies: readonly ZooRecruitSpeciesId[];
  theme: "canopy" | "water" | "forest" | "plains" | "alpine" | "solar" | "wetland" | "prairie";
};

export const ZOO_SIDE_QUESTS: Record<ZooSideQuestId, ZooSideQuestMetadata> = {
  "aviary-voices": {
    id: "aviary-voices",
    eyebrow: "World of Birds · Mango's canopy chorus",
    title: "Mango's Four Voices",
    objective: "Tune three acoustic horns into the flock’s live perch harmonics.",
    instructions: "Turn each physical horn while keeping its moving call pulse in view. The perch answers only when the horn reaches the live four-part canopy harmonic.",
    keyboard: "A / D tunes the active acoustic horn",
    recruitedSpecies: ["sun-conure", "blue-and-gold-macaw", "scarlet-ibis", "green-aracari"],
    theme: "canopy",
  },
  "sea-lion-current": {
    id: "sea-lion-current",
    eyebrow: "Sea Lion Pool · Enrichment channel",
    title: "Ride the Current",
    objective: "Counter three changing cross-currents and hold each buoy in its enrichment lane.",
    instructions: "Read the physical current indicator, trim the dock jets against the drift, and keep the live buoy and swimming sea lions in view through the lane.",
    keyboard: "A port trim · W center · D starboard trim",
    recruitedSpecies: ["california-sea-lion"],
    theme: "water",
  },
  "monkey-canopy-rig": {
    id: "monkey-canopy-rig",
    eyebrow: "Monkey Forest · Canopy maintenance",
    title: "Canopy Rig",
    objective: "Keep each physical canopy line inside its measured safe-tension band.",
    instructions: "Face the live load trolley and pulse the station wheel into its marked band. Tension bleeds naturally under load, so feed the line without over-tightening while the monkey tests the supported rig.",
    keyboard: "E pulses the station tension wheel",
    recruitedSpecies: ["spider-monkey"],
    theme: "forest",
  },
  "zebra-stripe-scan": {
    id: "zebra-stripe-scan",
    eyebrow: "African Plains · Conservation scanner",
    title: "Stripe Scan",
    objective: "Align three live moving profile bands with their identity references.",
    instructions: "Keep the walking zebra centered and slide each physical scanner head until the projected stripe profile sits on its amber reference.",
    keyboard: "A / D slides the active scanner",
    recruitedSpecies: ["plains-zebra"],
    theme: "plains",
  },
  "red-panda-scent-wind": {
    id: "red-panda-scent-wind",
    eyebrow: "Himalayan Forest · Scent enrichment",
    title: "Scent on the Wind",
    objective: "Aim each physical vane into one continuous canopy scent trail.",
    instructions: "Turn the vane left or right while keeping the live ribbon in view. The connected scent line carries into the habitat only when the station faces its seeded canopy direction.",
    keyboard: "A / D turns the active vane",
    recruitedSpecies: ["red-panda"],
    theme: "alpine",
  },
  "tortoise-sun-trail": {
    id: "tortoise-sun-trail",
    eyebrow: "Giant Tortoise · Solar warming yard",
    title: "Sun Trail",
    objective: "Aim each real mirror onto its habitat warming stone.",
    instructions: "Rotate the station mirror left or right while following the physical beam. A correctly aimed mirror locks the next sun spot onto its load-bearing basking shelf.",
    keyboard: "A / D rotates the active mirror",
    recruitedSpecies: ["aldabra-tortoise"],
    theme: "solar",
  },
  "flamingo-wetland-balance": {
    id: "flamingo-wetland-balance",
    eyebrow: "Flamingo Wetland · Habitat controls",
    title: "Wetland Balance",
    objective: "Hold water depth and salinity in their habitat bands.",
    instructions: "Operate intake, fresh reed-bed flow, and drainage at the live station. Keep water between 46–59 and salinity between 42–57 while the flock tests the restored shallows.",
    keyboard: "1 intake · 2 fresh flow · 3 drain",
    recruitedSpecies: ["american-flamingo"],
    theme: "wetland",
  },
  "bison-prairie-seeding": {
    id: "bison-prairie-seeding",
    eyebrow: "Bison Range · Grassland restoration",
    title: "Prairie Seeding",
    objective: "Match three surveyed bearings and spring charges to restore the bare prairie plots.",
    instructions: "Aim the physical hopper, tune its spring charge to the active plot survey, and follow the released native seed arc into the habitat.",
    keyboard: "A / D aims · W charges · S bleeds",
    recruitedSpecies: ["american-bison"],
    theme: "prairie",
  },
};

export type AviaryVoicesConfig = {
  questId: "aviary-voices";
  melody: readonly number[];
  roundLengths: readonly [number, number, number];
};

export type CurrentGridPoint = { x: number; y: number };
export type CurrentDirection = "left" | "right" | "forward" | "reverse";
export type SeaLionCurrentConfig = {
  questId: "sea-lion-current";
  start: CurrentGridPoint;
  gates: readonly CurrentGridPoint[];
  currentPattern: readonly (-1 | 0 | 1)[];
  /** A generated, validated route used by QA to prove every current is winnable. */
  solution: readonly CurrentDirection[];
};
export type SeaLionCurrentState = { position: CurrentGridPoint; gateIndex: number; turn: number };

export type MonkeyCanopyConfig = {
  questId: "monkey-canopy-rig";
  anchorOffsets: readonly number[];
  anchorSpeeds: readonly number[];
};

export type ZebraStripeConfig = {
  questId: "zebra-stripe-scan";
  initialOffsets: readonly number[];
  targetOffsets: readonly number[];
};

export type RedPandaScentConfig = {
  questId: "red-panda-scent-wind";
  initialDirections: readonly number[];
  solution: readonly number[];
};

export type TortoiseSunConfig = {
  questId: "tortoise-sun-trail";
  initialAngles: readonly number[];
  solution: readonly number[];
};

export type FlamingoWetlandConfig = {
  questId: "flamingo-wetland-balance";
  initialWater: number;
  initialSalinity: number;
  waterDrift: number;
  salinityDrift: number;
};

export type PrairieTarget = CurrentGridPoint & { radius: number; solutionAngle: number; solutionPower: number };
export type BisonPrairieConfig = {
  questId: "bison-prairie-seeding";
  wind: number;
  targets: readonly PrairieTarget[];
};

export type ZooSideQuestConfig =
  | AviaryVoicesConfig
  | SeaLionCurrentConfig
  | MonkeyCanopyConfig
  | ZebraStripeConfig
  | RedPandaScentConfig
  | TortoiseSunConfig
  | FlamingoWetlandConfig
  | BisonPrairieConfig;

function randomInt(random: () => number, minimum: number, maximumInclusive: number) {
  return minimum + Math.floor(random() * (maximumInclusive - minimum + 1));
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function circularStepDistance(a: number, b: number, steps: number) {
  const difference = Math.abs(a - b) % steps;
  return Math.min(difference, steps - difference);
}

export function createZooSideQuestConfig(id: ZooSideQuestId, random = Math.random): ZooSideQuestConfig {
  switch (id) {
    case "aviary-voices": {
      const melody: number[] = [];
      for (let index = 0; index < 7; index++) {
        let voice = randomInt(random, 0, 3);
        if (voice === melody[index - 1]) voice = (voice + 1 + randomInt(random, 0, 2)) % 4;
        melody.push(voice);
      }
      return { questId: id, melody, roundLengths: [3, 5, 7] };
    }
    case "sea-lion-current": {
      const start = { x: 3, y: 4 };
      const currentPattern = Array.from({ length: 12 }, () => randomInt(random, -1, 1) as -1 | 0 | 1);
      const solution: CurrentDirection[] = [];
      const gates: CurrentGridPoint[] = [];
      let position = { ...start };
      for (let gate = 0; gate < 3; gate++) {
        const setup: CurrentDirection = random() < .5 ? "left" : "right";
        for (const direction of [setup, "forward"] as const) {
          const drift = currentPattern[solution.length] ?? 0;
          const movement = direction === "left" ? -1 : direction === "right" ? 1 : 0;
          position = {
            x: clamp(position.x + movement + drift, 0, 6),
            y: clamp(position.y + (direction === "forward" ? -1 : 0), 0, 4),
          };
          solution.push(direction);
        }
        gates.push({ ...position });
      }
      return { questId: id, start, gates, currentPattern, solution };
    }
    case "monkey-canopy-rig":
      return {
        questId: id,
        anchorOffsets: Array.from({ length: 3 }, () => random()),
        anchorSpeeds: Array.from({ length: 3 }, (_, index) => .22 + index * .035 + random() * .035),
      };
    case "zebra-stripe-scan": {
      const targetOffsets = Array.from({ length: 3 }, () => randomInt(random, -4, 4));
      const initialOffsets = targetOffsets.map(target => clamp(target + (random() < .5 ? -1 : 1) * randomInt(random, 2, 4), -6, 6));
      return { questId: id, targetOffsets, initialOffsets };
    }
    case "red-panda-scent-wind": {
      const solution = Array.from({ length: 4 }, () => randomInt(random, 0, 3));
      return { questId: id, solution, initialDirections: solution.map(direction => (direction + randomInt(random, 1, 3)) % 4) };
    }
    case "tortoise-sun-trail": {
      const solution = Array.from({ length: 3 }, () => randomInt(random, 0, 5));
      return { questId: id, solution, initialAngles: solution.map(angle => (angle + randomInt(random, 1, 5)) % 6) };
    }
    case "flamingo-wetland-balance":
      return {
        questId: id,
        initialWater: 24 + random() * 15,
        initialSalinity: 66 + random() * 14,
        waterDrift: -.16 + random() * .34,
        salinityDrift: -.11 + random() * .3,
      };
    case "bison-prairie-seeding": {
      const wind = -.14 + random() * .28;
      // Give every numbered restoration plot its own readable lateral lane.
      // Independent random angle/power pairs could land almost exactly on top
      // of one another, hiding an entire target and making the puzzle appear
      // broken. Shuffle the three lanes so their order still changes per
      // session while their screen-space footprints never overlap.
      const solutionAngles = [-35, 0, 35];
      for (let index = solutionAngles.length - 1; index > 0; index--) {
        const swap = randomInt(random, 0, index);
        [solutionAngles[index], solutionAngles[swap]] = [solutionAngles[swap], solutionAngles[index]];
      }
      const targets = solutionAngles.map((solutionAngle, index) => {
        const solutionPower = 56 + randomInt(random, 0, 3) * 8;
        const landing = prairieLanding(solutionAngle, solutionPower, wind);
        return { ...landing, radius: .78 + index * .08, solutionAngle, solutionPower };
      });
      return { questId: id, wind, targets };
    }
  }
}

export function advanceSeaLionCurrent(
  state: SeaLionCurrentState,
  config: SeaLionCurrentConfig,
  direction: CurrentDirection,
): SeaLionCurrentState {
  const movement = direction === "left" ? [-1, 0] : direction === "right" ? [1, 0] : direction === "forward" ? [0, -1] : [0, 1];
  const drift = config.currentPattern[state.turn % config.currentPattern.length] ?? 0;
  const position = {
    x: clamp(state.position.x + movement[0] + drift, 0, 6),
    y: clamp(state.position.y + movement[1], 0, 4),
  };
  const gate = config.gates[state.gateIndex];
  const gateIndex = gate && position.x === gate.x && position.y === gate.y ? state.gateIndex + 1 : state.gateIndex;
  return { position, gateIndex, turn: state.turn + 1 };
}

export function canopyAnchorReady(phase: number) {
  return Math.min(Math.abs(phase - .5), 1 - Math.abs(phase - .5)) <= .105;
}

export function stripeBandAligned(offset: number, target: number) {
  return Math.abs(offset - target) <= .35;
}

export function scentTrailReach(directions: readonly number[], solution: readonly number[]) {
  let reach = 0;
  while (reach < solution.length && directions[reach] === solution[reach]) reach++;
  return reach;
}

export function sunTrailReach(angles: readonly number[], solution: readonly number[]) {
  let reach = 0;
  while (reach < solution.length && angles[reach] === solution[reach]) reach++;
  return reach;
}

export type WetlandValve = "intake" | "drain" | "fresh";
export type WetlandReading = { water: number; salinity: number };

export function operateWetlandValve(reading: WetlandReading, valve: WetlandValve): WetlandReading {
  if (valve === "intake") return { water: clamp(reading.water + 7.5, 0, 100), salinity: clamp(reading.salinity + 2.2, 0, 100) };
  if (valve === "drain") return { water: clamp(reading.water - 6.5, 0, 100), salinity: clamp(reading.salinity + 2.8, 0, 100) };
  return { water: clamp(reading.water + 4.5, 0, 100), salinity: clamp(reading.salinity - 8, 0, 100) };
}

export function wetlandReadingSafe(reading: WetlandReading) {
  return reading.water >= 46 && reading.water <= 59 && reading.salinity >= 42 && reading.salinity <= 57;
}

export function prairieLanding(angleDegrees: number, power: number, wind: number): CurrentGridPoint {
  const angle = angleDegrees * Math.PI / 180;
  return {
    x: Math.sin(angle) * power * .115 + wind * power * .055,
    y: Math.cos(angle) * power * .13,
  };
}

export function prairieShotHits(landing: CurrentGridPoint, target: PrairieTarget) {
  return Math.hypot(landing.x - target.x, landing.y - target.y) <= target.radius;
}
