/* El perfil con el que se ha entrado (v3.26). Módulo mínimo, sin dependencias, para que cualquiera
 * (datos.jsx, perfiles.jsx...) lo consulte sin importarse entre sí. */
let actual = "rderandom";
export const perfilEnUso = () => actual;
export const fijarPerfilEnUso = (id) => { actual = id || "rderandom"; };
