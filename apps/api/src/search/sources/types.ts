/** Datos auxiliares para el ranking que no se exponen al cliente. */
export interface RankInputExtra {
  _servesDestination: boolean | null;
  _failsMandatory: boolean;
  _specs: { met: number; total: number } | null;
}
