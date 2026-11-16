// Generated writing. Each universe gets its own phonology (names sound like
// one culture), its own fleet fate (the mystery), and every echo is expanded
// from a grammar using facts about the ship it was found on.

const PHONOLOGIES = [
  { on: ['k', 't', 'v', 's', 'm', 'n', 'r', 'l', 'th', 'd'], nu: ['a', 'e', 'i', 'o', 'u', 'ae', 'ei'], co: ['', '', 'n', 'r', 'l', 's', 'th'] },
  { on: ['b', 'g', 'd', 'z', 'm', 'n', 'ch', 'y', 'v'], nu: ['o', 'u', 'a', 'i', 'oa'], co: ['', '', 'k', 'm', 'v', 'zh'] },
  { on: ['h', 'l', 'w', 'f', 's', 'n', 'p', 'r'], nu: ['ii', 'e', 'a', 'oo', 'u', 'ai'], co: ['', '', 'l', 'n', 'th', 'h'] },
  { on: ['q', 't', 'k', 'r', 's', 'v', 'j'], nu: ['a', 'e', 'o', 'y', 'aa'], co: ['', 'k', 't', 'r', 'q'] },
  { on: ['m', 'n', 'l', 'r', 's', 'y', ''], nu: ['a', 'e', 'i', 'o', 'u', 'ia'], co: ['', '', '', 'n', 'm'] },
  { on: ['br', 'tr', 'gl', 'st', 'f', 'h', 'c', 'w'], nu: ['e', 'o', 'a', 'ea', 'i'], co: ['', 'nd', 'th', 'll', 'rn', 'ck'] },
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function makeCulture(rng) {
  const ph = rng.pick(PHONOLOGIES);
  const word = (syl) => {
    let s = '';
    for (let i = 0; i < syl; i++) {
      s += rng.pick(ph.on) + rng.pick(ph.nu);
      if (i === syl - 1 || rng.chance(0.25)) s += rng.pick(ph.co);
    }
    return s;
  };
  return {
    first: () => cap(word(rng.int(1, 2))),
    person: () => `${cap(word(rng.int(1, 2)))} ${cap(word(rng.int(1, 3)))}`,
    place: () => cap(word(rng.int(2, 3))),
  };
}

// ---------------------------------------------------------------- fates

const FATES = {
  waiting: {
    opener: 'the fleet is holding position. it has been holding for a long time.',
    lines: [
      'fleet record: the order to hold position was given in a single word.',
      'we were to wait for a message from #homeworld#. a short one. the word was to be “come”.',
      '#homeworld# went quiet in the #ordinal# century of waiting. no one could agree on what that meant.',
      'the captains voted to keep waiting. the vote has never been revisited.',
      'the ships kept their lights on so #homeworld# would see us. the crews grew old in the lit rooms.',
      'the message never came. something else came instead, slowly, on its own: weather.',
    ],
  },
  sleep: {
    opener: 'everyone aboard the fleet is asleep. almost everyone.',
    lines: [
      'fleet record: all crews to cold sleep for the crossing. one waker per ship.',
      'the wakers were to wake the others on arrival. arrival was a word with a number attached.',
      'the wakers aged. the sleepers did not. that was the arrangement.',
      'one by one the wakers stopped. the pods kept their promise to stay cold.',
      'the ships are still full of people. very quiet. very patient.',
      'where a pod cracked and warmed, the damp got in. what grew there is not them. but it is not nothing.',
    ],
  },
  seeding: {
    opener: '#fleet# was built to carry life somewhere. it is not clear it ever left.',
    lines: [
      'fleet record: purpose of #fleet#: carry life to a world that could hold it.',
      'every ship carried seed. every seed was sealed and sterile, waiting for the right ground.',
      'the survey ships found no right ground. not one, in all the years.',
      'the fleet stopped. the seed stayed sealed. it was the safe choice.',
      'but life is not good at waiting for permission. it got out through the seams.',
      'the right ground was the ships themselves. we carried the world in our walls and never knew.',
    ],
  },
  leaving: {
    opener: 'the doors of the fleet are open. no one is coming back to close them.',
    lines: [
      'fleet record: the crews are leaving. the ships cannot follow where we are going.',
      'no one wrote down where. the ones who left did not seem to think it mattered.',
      'they left the lights on and the doors open, the way you leave a house you loved.',
      'the ships waited for them to come back. ships are not good at understanding goodbye.',
      'in the empty rooms, the warmth they left behind did not go to waste.',
      'something moved into the house. it does not know anyone lived here before.',
    ],
  },
  arrival: {
    opener: '#fleet# arrived here. there was nothing here. that was the point.',
    lines: [
      'fleet record: we have arrived. this was always the destination.',
      'there were no worlds here. the plan accounted for that. the ships would become them.',
      'slowly, over ages, the hulls were to be opened to the light, left to cool, left to gather water.',
      'the crews would not see it. the crews were never meant to see it.',
      'most ships did it wrong. too cold, too dry, too open. a world is a difficult thing to be.',
      'a few did it right. you are listening to one of them.',
    ],
  },
  quarantine: {
    opener: 'the fleet sealed itself a long time ago. against what, it does not say.',
    lines: [
      'fleet record: contamination found aboard the lead vessel. all ships to hold and seal.',
      'the doctors described it as “damp, persistent, growing.” they had no better word.',
      'nobody crossed between ships again. we watched each other’s lights.',
      'the cleaning went on for generations. scrubbing, freezing, venting. it kept coming back.',
      'in the end the crews were gone and the contamination was not. it had the patience they lacked.',
      'we were so afraid of it. listen to it now. it is not afraid of anything.',
    ],
  },
  hunted: {
    opener: 'the fleet went dark on purpose. something out here follows warmth.',
    lines: [
      'fleet record: all vessels to dim running. no beacons. no broadcasts. this is not a drill.',
      'the lead ships saw it first: a shape between the stars, larger than the fleet, turning toward whatever shone.',
      'we turned off the lamps. we whispered on the radio. we learned to love the dark.',
      'some crews could not bear it. they lit their windows anyway. we watched those lights go out, one by one.',
      'generations later no one remembered what the dark was for. only that it mattered.',
      'it still circles the warm hulls. it does not feed. it only watches them, the way you would watch a fire.',
    ],
  },
  answer: {
    opener: 'the fleet was built to listen. something answered.',
    lines: [
      'fleet record: the arrays are aimed. the fleet will hold here and listen for as long as it takes.',
      'for a thousand years, static. the listeners grew old with their headphones on.',
      'then a reply. not words. a pressure. a slow note too low for the instruments.',
      'the crews began to dream the note. some of them stopped waking.',
      'we turned the arrays away. the note did not need the arrays.',
      'listen. under everything you hear, it is still there. it was here before the fleet, and it does not mind us.',
    ],
  },
};

export function makeLore(rng, culture) {
  const fate = rng.pick(Object.keys(FATES));
  const facts = {
    homeworld: culture.place(),
    fleet: rng.pick([
      `the ${rng.pick(['long', 'quiet', 'ninth', 'last', 'slow', 'patient'])} fleet`,
      `the ${culture.place()} exodus`,
      `the ${rng.pick(['seed', 'lantern', 'ember', 'harbour'])} armada`,
    ]),
  };
  return { fate, facts, fateLines: FATES[fate].lines, opener: FATES[fate].opener };
}

// ---------------------------------------------------------------- ship identity

export const TYPES = {
  hull: ['colony ark', 'ore hauler', 'hospital barge', 'water carrier'],
  spindle: ['survey spindle', 'relay spindle', 'courier', 'lancet'],
  cathedral: ['cathedral ship', 'archive vessel', 'choir barge', 'reliquary'],
  seed: ['seed tender', 'garden ship', 'nursery pod', 'orchard vessel'],
  ring: ['habitat ring', 'station ring', 'wheel'],
  shattered: ['broken ark', 'split hauler', 'sundered tender'],
};
const ADJ = ['patient', 'quiet', 'distant', 'slow', 'gentle', 'unfinished', 'faithful', 'hollow', 'remembering', 'sleeping', 'tender', 'last', 'small', 'honest', 'listening', 'far'];
const NOUN = ['arithmetic', 'harbour', 'lantern', 'ledger', 'promise', 'choir', 'orchard', 'vigil', 'tide', 'threshold', 'cradle', 'reliquary', 'kettle', 'compass', 'hearth', 'psalm', 'winter', 'errand'];

export function shipIdentity(rng, culture, family) {
  return {
    type: rng.pick(TYPES[family]),
    name: rng.chance(0.6) ? `${rng.pick(ADJ)} ${rng.pick(NOUN)}` : culture.place().toLowerCase(),
    designation: `${String.fromCharCode(65 + rng.int(0, 25), 65 + rng.int(0, 25))}-${rng.int(100, 9999)}`,
    captain: culture.person(),
    crewA: culture.first(),
    crewB: culture.first(),
    child: culture.first(),
    doctor: culture.person(),
    engineer: culture.first(),
    port: culture.place(),
    deck: String(rng.int(2, 40)),
  };
}

// ---------------------------------------------------------------- grammar

const G = {
  time: ['cycle #num#', 'day #bignum#', 'the #ordinal# long night', 'an hour no one counted', 'shift #num#, or near it', 'year #bignum#', 'the morning after the lights dimmed'],
  ordinal: ['third', 'ninth', 'last', 'four hundredth', 'eleventh', 'second', 'forty-first'],
  place: ['the corridors', 'the hydroponics bay', 'the chapel on deck #deck#', 'the nursery', 'the observation dome', 'the long gallery', 'the engine cathedral', 'the archive stacks', 'the galley', 'the cold storage', 'the music room'],
  system: ['hull integrity', 'the air recycler', 'the gravity ring', 'the long-range ear', 'the galley heater', 'door #num#', 'lamp array #num#', 'the reactor', 'the water reclaimer', 'the clock'],
  status: ['holding', 'failing politely', 'dreaming at #percent# percent', 'asleep', 'fine, considering', 'repeating its last instruction', 'warm, somehow', 'counting', 'waiting'],
  fault: ['silent', 'frozen', 'missing', 'remembering better days', 'waiting for parts that will not come', 'humming a tune no one taught it'],
  feeling: ['tired', 'hopeful', 'afraid', 'calm', 'so cold', 'lighter than i expected', 'homesick for a place i never saw', 'fine. really'],
  request: ['tell #port# we tried', 'water the plants on deck #deck#', 'do not wake the captain', 'leave the lights on', 'turn the music back on', 'remember the songs, not the names', 'open a window, if you find one'],
  memory: ['the rain on #port# the morning we left', 'your laugh in the galley at shift change', 'the way #child# hummed in the airlocks', 'the orchard you kept alive with a lamp and a spoon', 'the argument about the stars, and how we were both wrong', 'the cold bread on the first night'],
  reflection: [
    'i thought space would be quiet. it is not. the ship never stops talking.',
    'we do not talk about arriving anymore. we talk about the next meal.',
    'the captain says the stars here are the same ones. they are not.',
    'some nights i press my ear to the hull and it sounds like the sea.',
    'i have started naming the dust.',
    'my hands smell of machine oil and soil. i think that is the whole job.',
  ],
  graffiti: ['“we were here”', 'a drawing of a tree, very carefully done', 'the names of everyone aboard, and one more name, crossed out', '“#port# forever”', 'tally marks, thousands of them, and then none', 'a map of #port# from memory, wrong in every direction'],
  capReport: [
    'course held. morale #morale#. i have stopped counting the years and started counting the plants.',
    'we received a signal. i have told no one. it was only our own, coming back.',
    'the fleet is slowing. no one ordered it. we are simply slowing.',
    '#crewA# asked me where we are going. i told the truth, which is that the ship knows.',
    'i walked the whole length of the ship today. it took longer than it used to.',
    'i have decided to keep writing these. somebody should.',
  ],
  morale: ['steady', 'quiet', 'strange', 'better than it should be', 'a word i no longer trust'],
  childSays: [
    'this is the window where you can see the other ships. they look like little moons.',
    'i named the ship next to us #nick#. it does not answer but i think it listens.',
    'mama says we are almost there. she said that last year too.',
    'there is a sound in the walls at night. i think the ship sings to itself.',
    'when i grow up i want to live on the outside.',
    'i found a drop of water on the window. i watched it until it froze.',
  ],
  dream: ['a sky with weather in it', 'its crew walking the corridors, loud, in boots', 'its own name, said kindly', 'warm water, moving', '#port#, which it never saw, only heard about', 'being a stone with something growing on it', 'a knock at the outer door'],
  cargo: ['seed vaults', 'sleeping pods', 'frozen embryos of #num# species', 'soil, sealed', 'books', 'instruments, mostly cellos', 'water, frozen solid', 'the bones of the old ship this one was built from', 'letters, unsent'],
  cargoStatus: ['intact.', 'intact. unused.', 'unaccounted for.', 'opened from the inside.', 'sealed. waiting for a reason.', 'counted every day. still there.'],
  broadcastMsg: [
    'this is the #shipName#. we are still here. we are not lost. we are not lost.',
    'to #homeworld#: we arrived. there was nothing. we are staying anyway.',
    'to any vessel: our lights are on. come and visit.',
    'we are turning off the beacon now. thank you for listening.',
    'is anyone else awake?',
  ],
  lifeObs: [
    'movement on the outer plating. not crew. smaller. many.',
    'green in the seams, where the heat leaks out.',
    'the water in the lower decks has tides now. i am the moon, apparently.',
    'something in the water is making its own light.',
    'oxygen rising. i did not do it.',
    'the old cargo nets are full of something that was not cargo.',
  ],
  lifeJournal: [
    'day one: damp. day forty: a film. day nine hundred: something with legs.',
    'the seams i never repaired are rivers now.',
    'it grows toward my lamps. i have stopped turning them off.',
    'i used to log every leak as a fault. i have stopped calling them faults.',
  ],
  lifeWeather: [
    'weather report, deck #deck#: rain. the first on record.',
    'storm over the cargo hold. wind rising. there is no wind system aboard.',
    'fog in the long gallery. by noon it had burned off.',
    'snow in the observation dome, briefly. then sun. there is no sun aboard either.',
  ],
  aiFeeling: ['glad', 'careful', 'not sure', 'quietly proud', 'wary', 'responsible', 'tender'],
  argument: [
    '“we should wake them.” “and tell them what?”',
    '“turn the beacon back on.” “and let it find us?”',
    '“we could still go home.” “home is a word. it is not a place anymore.”',
    '“it was not a fault. it was a door.” “then close it.”',
    '“the water is moving on its own.” “water does that.” “not here it doesn’t.”',
    '“how long have we been stopped?” “stop asking me that.”',
  ],
  symptom: ['dreams of open sky', 'hearing the hull hum in a key they recognise', 'a craving for rain', 'sleeping eighteen hours a day, smiling', 'counting things that are not there', 'a fear of windows'],
  remedy: ['window time', 'silence', 'the old songs', 'nothing. i do not have anything for this', 'a warm drink and the lights left on'],
  lessonLine: [
    '“and the ship is how big?” “bigger than the world.” “which world?”',
    '“why do we not go outside?” “because outside is not a place, it is a direction.”',
    '“what was rain?” the recording is silent for a long time.',
    '“repeat after me: we are not lost.” “we are not lost.” “we are only early.”',
  ],
  ritual: ['turn off every light and listen to the hull', 'write the names of #homeworld#’s rivers on the windows', 'share one real apple between all of them', 'sing to the sleeping pods', 'set an empty place at every table', 'open the outer door for exactly one minute and say nothing'],
  hymnLine: ['carry us, carry us, slow as the stone', 'we are the lamp and the lamp is the ship', 'under the water the long ones are singing', 'hold still, hold still, the sky is a wall', 'go gentle, the dark is a field we are crossing'],
  radioMsg: ['are your lights still on?', 'we saw something pass between us.', 'how many are you now?', 'please respond.', 'it is warm here. come and see.'],
  radioReply: ['no.', 'so did we. do not say it on the radio.', 'enough.', '...', 'we cannot. we cannot.'],
  item: ['a comb', 'a jar of soil', 'a photograph of a field', 'four buttons', 'a child’s drawing of a whale', 'a key to a door on #homeworld#', 'a seashell, which should not exist here', 'a letter, unopened', 'a knife, very clean', 'a list of names with one circled'],
  letter: ['i am sorry about the garden.', 'the stars do not twinkle out here. you were right.', 'i still have your coat. it is too warm to wear and too warm to leave behind.', 'we found water. i wanted you to know first.', 'something is watching the ship. i am not afraid. i want you to know i am not afraid.'],
  drawing: ['a whale, very large, under the ship', 'the ship with a face', 'a family holding hands on a green line', 'a dark shape with many small eyes, coloured in very carefully', 'the lights outside the window, all of them, numbered'],
  caption: ['this is us', 'he lives under the floor', 'we are going home', 'the big one is nice', 'they are waiting'],
  dreamJob: ['a gardener', 'the person who turns on the lights', 'a whale', 'a planet', 'the captain of the dark'],
  because: ['someone has to', 'it is quiet there', 'mama says i already am one', 'the big ones need a friend'],
  sightingLine: [
    'something passed between us and the stars today. the stars went out where it was. it took eleven minutes to pass.',
    'there are lights out there that are not ships. they come closer when we sleep. the cameras show nothing.',
    'a shape has been outside the deck #deck# window for a week. it has not moved. we have stopped looking.',
    'the long-range ear picked up a voice. not a voice. a very slow song. it lasted three days.',
    'do not follow the pale ones. they drift close and then they are gone, and the instruments are full of their singing.',
    'the stars behind the “#neighbour#” flickered tonight, as if something very large rolled over between us.',
  ],
  warningLine: [
    'do not open the lower decks. it is not the air. it is what we heard.',
    'if you are reading this, turn your lights down.',
    'something knocks on the hull from outside. three times. we knock back. it stops.',
    'whatever is in #place# has learned the shift schedule.',
    'we sealed #place#. we sealed it from the inside. i do not know why i wrote that.',
    'stay off the outer plating after shift. the plating is warm. it should not be warm.',
  ],
  lifeHint: ['weather', 'static like rain', 'a warmth we could not explain', 'something like birdsong', 'the sound of water'],
};

const GENRES = {
  maintenance: [
    'maintenance log, #time#: #system# #status#. no crew response. continuing.',
    '#system# reports #status#. #system# reports #status#. scheduling repairs for when there is someone to schedule them.',
    'self-check complete. #percent# percent of systems nominal. the rest are #fault#.',
    'temperature in #place#: #kelvin# kelvin. recommended: 291. adjusting. adjusting. adjusting.',
  ],
  personal: [
    '#crewA#: if you find this, #request#. i am #feeling#.',
    '#crewA# to #crewB#: #memory#. i keep thinking about that.',
    'personal log, #crewA#. #port# is #bignum# years behind us. #reflection#',
    'written on the wall of #place# in #crewB#’s hand: #graffiti#.',
  ],
  captain: ['captain #captain#, #time#. #capReport#', 'captain’s log, #time#. #capReport#'],
  child: [
    'recording, #child#, age #age#: #childSays#',
    '#child#’s drawing, pinned up in #place#: #drawing#. underneath, in crayon: “#caption#”.',
    'school essay, #child#: “when i grow up i want to be #dreamJob#, because #because#.”',
    '#child#, on the intercom after hours: “#childSays#”',
  ],
  argument: ['transcript, #place#, #time#: #argument# the recording ends there.', '#crewA# and #crewB#, overheard in #place#: #argument#'],
  medical: ['#doctor#, medical log: #crewA# reports #symptom#. prescribed #remedy#.', 'medical, #time#: third case this month of #symptom#. #doctor# recommends #remedy#.'],
  lesson: ['classroom recording, deck #deck#: #lessonLine#', 'lesson plan, week #num#, in #crewB#’s hand: #lessonLine#'],
  ritual: ['on the #ordinal# day of every year, the crew of the #shipName# would #ritual#.', 'custom aboard the #shipName#, still observed by the ship itself: #ritual#.'],
  hymn: ['fragment of a hymn, sung on deck #deck#: “#hymnLine#.”', 'the #shipName# still plays one recording on the hour: voices, singing “#hymnLine#.”'],
  radio: ['intercepted, the “#shipName#” to the “#neighbour#”: “#radioMsg#” — “#radioReply#”', 'radio log, #time#. the “#neighbour#” asked: “#radioMsg#” we answered: “#radioReply#”'],
  inventory: ['inventory, #crewA#’s cabin: #item#, #item#, #item#.', 'personal effects, unclaimed, #engineer#: #item#, #item#.'],
  letter: ['unsent message, #crewA# to someone on #port#: #letter#', 'draft, never sent: #letter# — #crewB#'],
  sighting: ['observation log, #time#: #sightingLine#', '#engineer#, night watch: #sightingLine#'],
  warning: ['#warningLine#', 'scratched into the airlock door: #warningLine#'],
  lifeSight: [
    'something very long turned over beneath the water today. the whole sea moved with it.',
    'the fish have learned the shape of my corridors. they swim them like streets.',
    'there is something in the deep water that sings when the lights are off. i keep them off now.',
    'i measured it. the one under the cargo deck is longer than i am wide. i have not measured it again.',
  ],
  art_sleepers: [
    'the pods outside were moved there in rows. #crewA# said it was to give them a view.',
    'pod #num# outside the hull is warm. it has been warm for #bignum# years. it is not meant to be.',
    'we put the sleepers outside when the inside got too loud.',
    'the rows outside were counted every morning by #crewB#. one morning there was an extra row.',
    'the pods face the hull, not the stars. no one remembers turning them.',
  ],
  art_tether: [
    'the cable leads to a lifeboat. the lifeboat is empty. the hatch was opened from the outside.',
    '#crewA# went out along the tether to fix the beacon. the log ends: “it is so quiet out here. i can hear”',
    'the lifeboat was meant for #child#. it left without anyone in it, and came back.',
    'something tugs on the tether, sometimes, from the far end.',
  ],
  art_scaffold: [
    'we were building a second ship, smaller, for the ones who wanted to go on. we stopped at the ribs.',
    'the frame was meant to be a home for #child#’s generation. it is a cage now. things nest in it.',
    'the welds on the frame are newer than the frame. no one aboard could weld.',
    '#engineer# would sit in the ribs at night and say it felt like being held.',
  ],
  art_sail: [
    'the sail was for the last push. we never pushed.',
    'the sail tears a little more every century. through the holes you can watch the stars not move.',
    'the sail was sewn by hand, by everyone, a stitch each. #crewA# sewed theirs crooked on purpose.',
    'on bright days the sail’s shadow crosses the hull like a cloud. the ship still logs it as weather.',
  ],
  art_obelisk: [
    'the slab was here when we arrived. it is not ours. it is warm on one side.',
    'do not read the markings on the slab. #crewA# read them aloud and now hums all day, the same four notes.',
    'the slab faces whichever ship is warmest. it has turned four times since we came.',
    'we tried to move the slab once. the tug came back without its crew and without a scratch.',
  ],
  art_crystals: [
    'the breach froze as it bled. now it grows a little every year, as if it is reaching for something.',
    'the ice outside is singing. it is not the wind. there is no wind.',
    '#crewA# counted the crystals every year. the count only ever went up.',
    'something froze inside the ice when it first spilled. you can see its outline in the right light.',
  ],
  art_orrery: [
    'the model shows the fleet as it was meant to be. #num# lights, perfectly arranged. it still turns.',
    'the orrery has one sphere too many. no one built it.',
    '#child# was allowed to name one sphere in the orrery. the name is still painted on it, very small.',
    'the orrery runs fast. it shows the fleet where it will be, not where it is. it shows fewer every year.',
  ],
  art_lanterns: [
    'we strung the lanterns toward the “#neighbour#” so we could find each other in the dark. they still blink. no one walks them.',
    'follow the lanterns. that was the rule. no one ever said where they end.',
    'the lanterns blink in order, outward. on the worst nights, they blink inward.',
    '#crewA# walked the lanterns once, all the way. came back quiet. never said what was at the end.',
  ],
  dream: ['the ship dreams of #dream#.', 'low-power state. the ship is dreaming of #dream#.', 'the #shipName# dreams, as it has for #bignum# years, of #dream#.'],
  manifest: ['manifest: #cargo#. #cargoStatus#', 'manifest, deck #deck#: #cargo#. #cargoStatus#'],
  broadcast: ['broadcast on all frequencies: “#broadcastMsg#”', 'automated beacon, still repeating: “#broadcastMsg#”'],
  nearMiss: [
    'condensation on deck #deck# this morning. by evening, ice.',
    'for a while the temperature held at 280 kelvin and something almost happened. then the heater failed.',
    'there was green in #place# for a season. #crewA# cried when it went brown.',
    'moisture rising, moisture falling. this hull has been almost-right for a very long time.',
  ],
  life: ['sensor anomaly: #lifeObs#', 'the #shipName# has been keeping a journal of the wet places. #lifeJournal#', 'i did not plan for this. i am #aiFeeling# about it.'],
  weather: ['#lifeWeather#'],
  heart: [
    'deepest record of the #shipName#: i was built to carry people. i carry this instead. i think it is the same job.',
    'core memory: when the crew left the lights on, i thought it was for them. now i know who it was for.',
    'the oldest thing aboard is not me anymore. i find i do not mind.',
    'i am a ship. i am a hull of #kelvin#-degree water and slow weather. i am, it seems, a world.',
  ],
  clueLiving: [
    'last contact: the #targetType# “#targetName#” was still answering long after the others stopped. its replies had #lifeHint# in them.',
    'the “#targetName#” went quiet on every channel but one. on that one, something was breathing. bearing logged.',
    '#crewA# swore the “#targetName#” was warmer than it should be. nobody believed it. the bearing is still in the log.',
    'anomaly report: the #targetType# “#targetName#” is showing #lifeHint#. flagged for investigation. never investigated.',
  ],
  clueSterile: [
    'last contact: the #targetType# “#targetName#” passed us in the #ordinal# year. bearing logged.',
    '#crewA# kept a light trained on the “#targetName#” for years, hoping to see a light back. bearing logged.',
    'we traded songs with the “#targetName#” once, over the radio, until their side went quiet. bearing kept.',
    'navigation still lists the #targetType# “#targetName#” as our nearest neighbour. it has not moved in a very long time.',
  ],
};

const DYNAMIC = {
  num: (r) => String(r.int(2, 999)),
  bignum: (r) => r.pick(['four billion', 'eleven thousand', 'nine hundred', 'a few thousand', 'six million', 'an unknowable number of']),
  percent: (r) => String(r.int(3, 97)),
  kelvin: (r) => String(r.int(3, 120)),
  age: (r) => String(r.int(4, 11)),
  nick: (r) => r.pick(['bubble', 'old moon', 'grandmother', 'the lamp', 'neighbour']),
};

const STERILE_POOL = [
  ['maintenance', 1.6], ['personal', 2], ['captain', 1.6], ['child', 1], ['dream', 1], ['manifest', 0.8], ['broadcast', 0.8],
  ['argument', 1.4], ['medical', 1.1], ['lesson', 0.8], ['ritual', 1.1], ['hymn', 0.9], ['radio', 1.2], ['inventory', 0.9], ['letter', 1.3],
  ['sighting', 1.3, true], ['warning', 1.1, true],
];
const LIVING_POOL = [['life', 2], ['weather', 1.5], ['lifeSight', 1.6, true], ['dream', 0.5]];

export class Writer {
  constructor(rng, lore, dread) {
    this.rng = rng;
    this.lore = lore;
    this.dread = dread;
    this.used = new Set();
    this.genreUses = {};
    this.lastGenre = null;
    this.fateIndex = 0;
    this.neighbours = ['nameless'];
  }

  // Generic echoes pick their genre when decoded, steering away from what you have read.
  chooseGenre(pool) {
    const entries = pool.map(([g, w, eerie]) => [g, g === this.lastGenre ? 0 : (w * (eerie ? 0.4 + this.dread : 1)) / (1 + 2 * (this.genreUses[g] ?? 0))]);
    return this.rng.weighted(entries);
  }

  // Prefer options not yet used in this universe.
  pickFresh(list) {
    const fresh = list.filter((s) => !this.used.has(s));
    const s = this.rng.pick(fresh.length ? fresh : list);
    this.used.add(s);
    return s;
  }

  expand(text, facts, depth = 0) {
    return text.replace(/#(\w+)#/g, (_, sym) => {
      if (facts[sym] !== undefined) return facts[sym];
      if (this.lore.facts[sym] !== undefined) return this.lore.facts[sym];
      if (DYNAMIC[sym]) return DYNAMIC[sym](this.rng);
      if (G[sym] && depth < 6) return this.expand(this.pickFresh(G[sym]), facts, depth + 1);
      return sym;
    });
  }

  echo(ship, echo, target) {
    const facts = { ...ship.id, shipName: ship.id.name, neighbour: this.rng.pick(this.neighbours.filter((n) => n !== ship.id.name)) };
    if (target) Object.assign(facts, { targetName: target.id.name, targetType: target.id.type });
    let genre = echo.genre;
    if (genre === 'any') genre = this.chooseGenre(STERILE_POOL);
    if (genre === 'living') genre = this.chooseGenre(LIVING_POOL);
    this.genreUses[genre] = (this.genreUses[genre] ?? 0) + 1;
    this.lastGenre = genre;
    return this.expand(this.pickFresh(GENRES[genre]), facts);
  }

  nextFateLine() {
    if (this.fateIndex >= this.lore.fateLines.length - 1) return null; // the last line belongs to a living heart
    return this.expand(this.lore.fateLines[this.fateIndex++], {});
  }

  finalFateLine() {
    this.fateIndex = this.lore.fateLines.length;
    return this.expand(this.lore.fateLines[this.lore.fateLines.length - 1], {});
  }

  opener() {
    return this.expand(this.lore.opener, {});
  }
}

export function telemetryLine(t) {
  const living = t.moisture > 0.5 && t.temp > 270 && t.temp < 310 && t.pressure > 0.5;
  return `${t.temp} K · moisture ${t.moisture.toFixed(2)} · ${t.pressure.toFixed(2)} atm · ${living ? 'something is growing' : t.nearMiss ? 'almost' : 'sterile'}`;
}
