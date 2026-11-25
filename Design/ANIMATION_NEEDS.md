# Animations still needed (M3 follow-up)

The characters use Quaternius Universal Base Characters with the Universal Animation Library (CC0).
Several everyday actions are approximated today with procedural bone poses on top of an idle clip.
These would look more natural with real clips. All must be retargeted to the shared UBC skeleton.

| Action in game | Today | Wanted clip | Possible source |
| --- | --- | --- | --- |
| Sleep (lying in bed) | Lying pose built from bone rotations | Lying idle loop, turning over | Mixamo "Sleeping Idle" |
| Eat at table / warung | Sitting idle + hand gesture | Sitting eating loop (spoon to mouth) | Mixamo "Eating" (seated) |
| Cook (stir, chop) | Standing idle + arm gesture | Stirring pan loop, chopping loop | Mixamo "Cooking" style clips |
| Shower | Standing idle + arm gesture | Washing body loop | Mixamo or custom |
| Prayer: sholat | Procedural standing/bow/sujud poses | Full sholat sequence, respectful and accurate | Custom motion (reviewed by a practising Muslim) |
| Prayer: Christian / Catholic | Kneel + folded hands pose | Kneeling prayer loop | Mixamo "Kneeling" + hand pose |
| Prayer: Hindu (sembahyang) | Seated pose + hands raised | Seated, hands above forehead with flower | Custom |
| Prayer: Buddhist / Konghucu | Standing bow pose | Bow with incense (three bows) | Custom |
| Using phone | Idle + raised arm | Texting loop, standing and seated | Mixamo "Texting" |
| Riding the motorbike | Seated pose | Riding loop with lean | Custom |

Rules:
- Only use clips whose license allows commercial use; log each one in `Design/ASSET_LICENSES.md`
  with the source URL before committing.
- Mixamo clips require the owner's free Adobe account to download (the owner does this step).
- Religious motions must be accurate and respectful; review them with someone of that faith.
