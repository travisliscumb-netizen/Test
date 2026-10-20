const { THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, FXAAShader } = window.__PV_THREE;
window.__pvModuleStarted = true;

/* #####################################################################
   MASTER TEMPLATE  ·  1.0-STABLE
   Stable reusable single-file game foundation.
   Do not modify this master directly. Duplicate before building a new game.

   Workflow:  MASTER TEMPLATE  ->  duplicate the file  ->  NEW GAME BUILD

   Layout (file order). Every section header is tagged:
     [CORE]          reusable engine system; keep as-is in a new game
     [CONTENT]       Port Valen data/generation; replace for a new game
     [CORE+CONTENT]  engine + its data tables in one place (tables are
                     consts at the top of the section)
   Engine:  utilities, save, input, audio, materials, geometry builder,
            collision grid, prop/chunk streaming, character renderer,
            player, camera, spatial hash, vehicle physics + manager,
            particles/FX, traffic AI, drive AI, pedestrians, police,
            combat, environment (time/weather), mission stage engine,
            interiors kit, UI manager, quality manager, post-processing,
            Game loop, boot.
   Content: world constants + city generator, architecture + landmarks,
            places, prop/vehicle definitions, missions, campaign, races,
            events, characters, shops, economy, achievements.
   Every tunable/content table is indexed in GAME_CONFIG (just above BOOT).
   Player state changes go through Game.resetPlayerState() /
   Player.resetTransient() — never reset pose or input fields ad hoc.
   ##################################################################### */
const MASTER_TEMPLATE_VERSION = '1.0-STABLE';

