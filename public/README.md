# Your own files (models, pictures, sounds)

Anything in this `public` folder is put on the website as it is, at the same path:

| Put it here | The game loads it from |
| --- | --- |
| `public/models/zombie.glb` | `/models/zombie.glb` |
| `public/textures/grass.png` | `/textures/grass.png` |
| `public/sounds/shot.mp3` | `/sounds/shot.mp3` |

- **Models**: `.glb` (best) or `.gltf`. Keep each one small (under ~5 MB) so the game loads fast.
- **Pictures**: `.png` / `.jpg` / `.webp`.
- **Sounds**: `.mp3` / `.ogg`.

Uploading a file here doesn't change the game by itself: ask Claude to use it (e.g. "use public/models/zombie.glb for the zombies").
