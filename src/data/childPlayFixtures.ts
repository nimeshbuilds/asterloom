import type { Source } from '../types';
import type { ChildPlayActivity } from '../lib/childPlayEngine';
const puppetLines = [
  'Ada is the helper in this fictional puppet story.',
  'Bo is the friend in this fictional puppet story.',
  'The cup begins on the Tray; the Table is the sharing station.',
  'Ada says: “Bo, would you like to use the cup?”',
  'Bo says: “Yes, please. Let’s put the cup on the Table.”',
  'Bo puts the cup on the Table. Ada and Bo can take turns.',
  'Ada takes the cup to the Table without asking. Bo would like a turn too.',
  'Story goal: Ada asks first, Bo agrees to share, and the cup reaches the Table.',
];
const shopLines = [
  'Mila is the shopkeeper in this fictional pretend shop.',
  'Niko is the customer in this fictional pretend shop.',
  'An apple and a cup begin on the Shelf. The Counter is for prepared orders. The Basket is where the customer takes an order.',
  'Niko says: “Please put the apple on the Counter.”',
  'Mila sets the apple on the Counter. Niko can choose where it goes next.',
  'Niko puts the apple in the Basket. The order is ready.',
  'Mila brings the cup to the Counter. Niko asked for an apple. They can try again.',
  'Shop goal: Mila puts the requested apple on the Counter, then Niko moves the apple to the Basket.',
];
export const childPlaySources: Source[] = [
  { id: 'puppet-script', title: 'The shared cup — original fictional source script', kind: 'text', text: puppetLines.join('\n'), status: 'ready', addedAt: '2026-10-04T00:00:00.000Z' },
  { id: 'shop-script', title: 'The little shop — original fictional source script', kind: 'text', text: shopLines.join('\n'), status: 'ready', addedAt: '2026-10-04T00:00:00.000Z' },
];
export const puppetStoryFixture: ChildPlayActivity = {
  version: 1, id: 'shared-cup-puppet-story', kind: 'child-play', mode: 'puppet-story', scaffoldIds: ['puppet-stories'], title: 'A cup for two friends',
  instruction: 'Choose a puppet, give it a voice, and see how the story changes.', explanation: 'This story gives both friends a turn in deciding how to use the cup.', hint: 'Listen to both puppets. Who has the next line?', reviewStatus: 'reviewed',
  sourceRefs: puppetLines.map(evidence => ({ sourceId: 'puppet-script', evidence })),
  caregiverNote: 'Read each line aloud or give the puppets different voices. Let the child choose the next speaker and action. Talk about what Bo and Ada noticed. The figures are imaginary paper puppets, not factual animal illustrations.',
  maxTurns: 4, startSceneId: 'begin',
  characters: [
    { id: 'ada', name: 'Ada', role: 'helper', puppet: 'long-ears', color: 'sage', evidenceRefs: [0] },
    { id: 'bo', name: 'Bo', role: 'friend', puppet: 'round', color: 'coral', evidenceRefs: [1] },
  ],
  props: [{ id: 'cup', name: 'cup', symbol: 'cup', evidenceRefs: [2] }],
  stations: [{ id: 'tray', name: 'Tray', evidenceRefs: [2] }, { id: 'table', name: 'Table', evidenceRefs: [2] }],
  scenes: [
    { id: 'begin', title: 'A question for a friend', narrative: puppetLines[3], speakerId: 'ada', propLocations: { cup: 'tray' }, mood: 'ready', evidenceRefs: [3] },
    { id: 'bo-turn', title: 'Bo has a turn', narrative: puppetLines[4], speakerId: 'bo', propLocations: { cup: 'tray' }, mood: 'ready', evidenceRefs: [4] },
    { id: 'shared', title: 'The sharing table', narrative: puppetLines[5], speakerId: 'bo', propLocations: { cup: 'table' }, mood: 'celebrating', ending: 'goal', evidenceRefs: [5] },
    { id: 'think', title: 'Another point of view', narrative: puppetLines[6], speakerId: 'bo', propLocations: { cup: 'table' }, mood: 'thinking', ending: 'reflect', evidenceRefs: [6] },
  ],
  actions: [
    { id: 'ada-asks', fromSceneId: 'begin', toSceneId: 'bo-turn', actorId: 'ada', kind: 'say', label: 'Bo, would you like to use the cup?', evidenceRefs: [3] },
    { id: 'ada-takes', fromSceneId: 'begin', toSceneId: 'think', actorId: 'ada', kind: 'say', label: 'Ada takes the cup to the Table without asking.', evidenceRefs: [6] },
    { id: 'bo-shares', fromSceneId: 'bo-turn', toSceneId: 'shared', actorId: 'bo', kind: 'say', label: 'Let’s put the cup on the Table.', evidenceRefs: [4, 5] },
  ],
  objectives: [
    { id: 'ask-first', label: 'Give Ada a turn to ask first.', kind: 'perform', actionIds: ['ada-asks'], evidenceRefs: [7] },
    { id: 'bo-responds', label: 'Give Bo a turn to agree to share.', kind: 'perform', actionIds: ['bo-shares'], evidenceRefs: [7] },
    { id: 'shared-location', label: 'Bring the cup to the Table.', kind: 'place', propId: 'cup', stationId: 'table', evidenceRefs: [7] },
  ],
};
export const pretendPlayFixture: ChildPlayActivity = {
  version: 1, id: 'little-shop-pretend-play', kind: 'child-play', mode: 'pretend-play', scaffoldIds: ['pretend-play-stations'], title: 'The little shop',
  instruction: 'Play the shopkeeper and the customer. Move a prop to a station and watch what happens.', explanation: 'The shopkeeper prepares the requested object, then the customer takes it to their Basket.', hint: 'Read what Niko requested. Choose whose turn it is, pick the prop, then choose the next station.', reviewStatus: 'reviewed',
  sourceRefs: shopLines.map(evidence => ({ sourceId: 'shop-script', evidence })),
  caregiverNote: 'Invite the child to voice both roles and name the prop they are using. Pointing and clicking are enough; dragging is optional. You may repeat the request or take a break. Mark support when you guide the answer.',
  maxTurns: 4, startSceneId: 'order',
  characters: [
    { id: 'mila', name: 'Mila', role: 'shopkeeper', puppet: 'pointed', color: 'gold', evidenceRefs: [0] },
    { id: 'niko', name: 'Niko', role: 'customer', puppet: 'round', color: 'blue', evidenceRefs: [1] },
  ],
  props: [{ id: 'apple', name: 'apple', symbol: 'apple', evidenceRefs: [2] }, { id: 'cup', name: 'cup', symbol: 'cup', evidenceRefs: [2] }],
  stations: [{ id: 'shelf', name: 'Shelf', evidenceRefs: [2] }, { id: 'counter', name: 'Counter', evidenceRefs: [2] }, { id: 'basket', name: 'Basket', evidenceRefs: [2] }],
  scenes: [
    { id: 'order', title: 'A customer arrives', narrative: shopLines[3], speakerId: 'niko', propLocations: { apple: 'shelf', cup: 'shelf' }, mood: 'ready', evidenceRefs: [3] },
    { id: 'ready', title: 'The order is prepared', narrative: shopLines[4], speakerId: 'mila', propLocations: { apple: 'counter', cup: 'shelf' }, mood: 'ready', evidenceRefs: [4] },
    { id: 'packed', title: 'Ready to go', narrative: shopLines[5], speakerId: 'niko', propLocations: { apple: 'basket', cup: 'shelf' }, mood: 'celebrating', ending: 'goal', evidenceRefs: [5] },
    { id: 'different-prop', title: 'Check the request', narrative: shopLines[6], speakerId: 'niko', propLocations: { apple: 'shelf', cup: 'counter' }, mood: 'thinking', ending: 'reflect', evidenceRefs: [6] },
  ],
  actions: [
    { id: 'prepare-apple', fromSceneId: 'order', toSceneId: 'ready', actorId: 'mila', kind: 'use-prop', propId: 'apple', stationId: 'counter', label: 'Mila sets the apple on the Counter.', evidenceRefs: [4] },
    { id: 'prepare-cup', fromSceneId: 'order', toSceneId: 'different-prop', actorId: 'mila', kind: 'use-prop', propId: 'cup', stationId: 'counter', label: 'Mila brings the cup to the Counter.', evidenceRefs: [6] },
    { id: 'take-order', fromSceneId: 'ready', toSceneId: 'packed', actorId: 'niko', kind: 'use-prop', propId: 'apple', stationId: 'basket', label: 'Niko puts the apple in the Basket.', evidenceRefs: [5] },
  ],
  objectives: [
    { id: 'prepare-request', label: 'Mila prepares the requested apple on the Counter.', kind: 'perform', actionIds: ['prepare-apple'], evidenceRefs: [7] },
    { id: 'take-request', label: 'Niko puts the apple in the Basket.', kind: 'place', propId: 'apple', stationId: 'basket', evidenceRefs: [7] },
  ],
};
export const childPlayFixtures = [puppetStoryFixture, pretendPlayFixture];
