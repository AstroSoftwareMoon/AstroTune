//! AstroTune PC core. Everything the app stores stays in the user's own data folder;
//! the only network access is the music client in [`net`], and every host it reaches is
//! listed in [`privacy::ConnLog`] so the user can see it.

pub mod model;
pub mod net;
pub mod privacy;
pub mod store;
pub mod yt;
