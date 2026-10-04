import type {Notebook,Source} from '../types';
import {compileNotebook} from '../lib/compiler';
import {ACTIVITY_EXAMPLES,EXAMPLE_ACTIVITY_SOURCE} from '../lib/structuredEngine';
const data=[{
 id:'demo-cosmos',title:'A small guide to the cosmos',description:'From the light of distant stars to the worlds next door. A little curiosity goes a long way.',theme:'observatory',source:'A pocket field guide to space',text:`Star: A luminous sphere of hot plasma that produces energy through nuclear fusion in its core.
Planet: A large body that orbits a star and does not produce its own light through sustained nuclear fusion.
Orbit: The curved path of an object moving around another object under gravity.
Gravity: The attraction between objects with mass.
Light-year: The distance that light travels through a vacuum in one year.
Galaxy: A gravitationally bound collection of stars, gas, dust, and dark matter.
Nebula: An interstellar cloud of gas and dust.
Moon: A natural satellite orbiting a planet or another larger body.
Asteroid: A small rocky object that orbits the Sun.
Comet: An icy object that can develop a glowing coma and tail when it approaches the Sun.
The Earth takes approximately 365 days to complete one orbit around the Sun.
The Moon reflects sunlight rather than producing visible light through nuclear fusion.
The Sun contains most of the mass of the solar system.
Observe the night sky:
1. Choose a safe observing place away from bright artificial lights.
2. Allow your eyes time to adjust to the darkness.
3. Find a recognizable constellation using a sky chart.
4. Record the time, direction, and objects you observed.`},
 {id:'demo-garden',title:'The secret life of plants',description:'Uncover what makes a garden grow, one discovery at a time.',theme:'forest',source:'Notes from the garden',text:`Photosynthesis: The process in which plants use light energy to make sugars from carbon dioxide and water.
Chlorophyll: A green pigment that absorbs light used in photosynthesis.
Root: A plant organ that commonly anchors the plant and absorbs water and dissolved minerals.
Stomata: Small pores on plant surfaces that allow gas exchange and regulate water loss.
Pollination: The transfer of pollen from an anther to a stigma.
Germination: The process in which a seed begins to grow into a seedling under suitable conditions.
Transpiration: The loss of water vapor from the aerial parts of plants, mainly through stomata.
Xylem: The vascular tissue that transports water and dissolved minerals from roots through a plant.
Phloem: The vascular tissue that transports sugars and other organic compounds in a plant.
Plants use some of the sugars they produce as fuel for cellular respiration.
Growing a bean seed:
1. Place a healthy bean seed in moist growing medium.
2. Keep the growing medium moist without waterlogging it.
3. Observe the emerging root and shoot over the following days.
4. Move the seedling to suitable light as its leaves develop.`},
 {id:'demo-network',title:'Inside the connected world',description:'Follow a request across the internet and make the pieces click.',theme:'workshop',source:'Networking field notes',text:`IP address: A numerical label used to identify a network interface for communication using Internet Protocol.
DNS: The system that resolves domain names to resource records, including IP addresses.
Router: A device that forwards packets between networks using destination information.
Packet: A formatted unit of data carried by a packet-switched network.
TCP: A transport protocol that provides an ordered and reliable byte stream between applications.
UDP: A transport protocol that sends datagrams without guaranteeing delivery or order.
HTTPS: HTTP communication secured using Transport Layer Security.
Latency: The delay experienced as data travels between endpoints.
Bandwidth: The maximum rate at which data can be transferred over a communication path under stated conditions.
Cache: A store of previously obtained data that can reduce repeated retrieval work.
Troubleshooting a network connection:
1. Confirm that the device is connected to the intended local network.
2. Check whether other devices can reach the same destination.
3. Test name resolution and connectivity separately.
4. Record the observations before changing the configuration.`}
];
export function demoNotebooks():Notebook[]{return data.map((d,i)=>{const source:Source={id:`${d.id}-source`,title:d.source,kind:'text',text:d.text,status:'ready',addedAt:new Date().toISOString()};return{id:d.id,title:d.title,description:d.description,theme:d.theme,ageGroup:'adult',goal:'Understand and remember',scaffoldIds:['recall-escape-mission'],sources:d.id==='demo-network'?[source,{...EXAMPLE_ACTIVITY_SOURCE,kind:'text',addedAt:new Date().toISOString()} as Source]:[source],activities:d.id==='demo-network'?ACTIVITY_EXAMPLES:undefined,cards:compileNotebook([source],{maxCards:24}).cards,createdAt:new Date(Date.now()-i*86400000).toISOString(),updatedAt:new Date(Date.now()-i*86400000).toISOString(),revision:1};});}
