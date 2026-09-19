/** C1A source data only. These are not production TrinketDefinition/QuestDefinition. */
export type CommunityContentSet = 'core' | 'color-of-madness' | 'crimson-court' | 'warrens' | 'cove' | 'weald';
export interface CommunitySourceDefinition {
  readonly id: string;
  readonly printedName: string;
  readonly contentSet: string;
  readonly level: number | null;
  readonly sourceStatus: string;
  readonly normalizationStatus: string;
  readonly sourceReferences: readonly string[];
}
/** Freeze nested JSON as well as its array; callers cannot mutate the source registry. */
export function freezeSourceData<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeSourceData(child);
    Object.freeze(value);
  }
  return value;
}
