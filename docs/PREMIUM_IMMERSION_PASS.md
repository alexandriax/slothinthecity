# Premium immersion and replayability pass

This pass treats New York as a continuous playable place rather than scenery behind isolated mechanics. The original requested corrections are all included: the Bronx Zoo shuttle no longer faces a void; the Fifth Avenue subway and museum arrivals have complete city/park context; crowds have broader visual and motion variation; zoo and lake activities stay in the world; Mango's identity and support credit are on the aviary sign; habitat quests trigger along each enclosure; and Whiskers has a tan-and-white museum trail quest.

## Additional implemented improvements

The following additions are beyond those direct corrections. Each is present in runtime code and covered by source, contract, or gameplay tests.

1. Southern Boulevard continues past the zoo arrival as a full roadway instead of terminating at the camera edge.
2. The zoo arrival has continuous sidewalks on both sides of the boulevard.
3. A raised, high-visibility shuttle crosswalk connects the zoo path to the arrival district.
4. A staffed-looking visitor-services pavilion gives the arrival edge a destination and human scale.
5. Full-volume Bronx streetwall buildings replace horizon cards behind the shuttle.
6. Recessed windows, stepped cornices, and rooftop water tanks give the Bronx skyline readable depth.
7. Parked city vehicles add curbside context without interfering with the playable route.
8. A layered native-tree buffer makes the transition from city street to zoo grounds gradual.
9. Twenty-four physical habitat research stations replace detached zoo UI stages.
10. Eight station types use habitat-specific equipment: acoustic perches, buoy docks, rope anchors, stripe scanners, scent vanes, warming mirrors, wetland valves, and seed plots.
11. Animated research beacons communicate the current physical action without freezing the world.
12. Every habitat route rotates or reverses from a stable session seed, producing repeat-visit variation.
13. A persistent research streak rewards completing multiple habitat routes in one visit.
14. Live HUD progress and world wayfinding update for each research station.
15. Habitat-specific spatial audio cues reinforce actions while animals, guests, and foliage keep moving.
16. Recruited habitat animals enter the persistent menagerie immediately after their in-world route.
17. The zoo crowd scales to twelve authored character variants on high quality.
18. Zoo guests now vary skin tone, face, clothing palette, outfit layers, headwear, and accessories.
19. Curved promenade routes replace repeated straight-line crowd patrols.
20. Individual pause timing and look-around offsets prevent synchronized robotic stops.
21. Fifth Avenue is now a continuous multi-block roadway beside the Central Park subway entrance.
22. West 59th Street forms a real cross street with its own sidewalk and lane hierarchy.
23. A striped Fifth Avenue crossing provides a legible pedestrian connection to the park.
24. Articulated Fifth Avenue buildings include storefront bases, recessed windows, cornices, and rooftop detail.
25. Context traffic, curbside taxis, park-edge lamps, trees, and a newsstand make the subway corner feel occupied.
26. The museum arrival continues Central Park as a parallel pedestrian greenway across from the facade.
27. A rusticated park boundary wall, benches, and Manhattan schist outcrops establish the park edge.
28. A signalized Central Park West crossing and bicycle dock add credible street-level circulation.
29. Multiple Upper West Side corner buildings and post-museum blocks close exterior sightlines.
30. The museum crowd scales to twelve variants and uses the same smooth, asynchronous movement system.
31. Whiskers follows a session-varied route through the rotunda and three rotating gallery hideouts.
32. Brass pawprint beacons light the active gallery trail without replacing exploration.
33. Whiskers travels along curved paths, uses authored idle/walk/pounce clips, and follows the player after discovery.
34. Whiskers ships with project-original editable Blender source, a 21-bone rig, 2K tan/white PBR source maps, two LODs, provenance, and fresh-import review renders.
35. Reedline Rescue chooses three physical lily snags from a six-location lake pool on each seeded session.
36. The mallard now swims toward the active snag, turning the rescue into a moving lake traversal.
37. Freed snags visibly remove discarded floats and restore water-lily blossoms and clear-water halos.
38. A restoration-flow bonus rewards keeping pace across the lake rather than waiting between interactions.

## Production gates

- `npm run build`
- Complete Node test suite
- Authored-animal manifest regeneration and GLB contract validation
- Fixed-camera clay, textured, paw-contact, and fresh-import Whiskers review
- `/debug/animals` Hero/Mobile and animation review
- `/debug/characters` crowd silhouette, locomotion, and no-fallback-flash review
- Checkpoint review for the zoo arrival, every habitat route, museum arrival, Whiskers trail, and lake rescue
