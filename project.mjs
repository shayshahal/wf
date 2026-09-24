// project.mjs — the project wf runs rounds on. Everything project-specific (apps and their ports,
// setup, database, checks, tracker, people) lives in projects/<name>/index.mjs; the rest of wf
// imports it from here and nowhere else. One project so far; the second one decides how wf picks.
export * from './projects/jewelryx/index.mjs';
