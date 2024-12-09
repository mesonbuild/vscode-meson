export type VersionArray = [number, number, number];

const versionNames = ["major", "minor", "patch"] as const;

export class Version {
  constructor(private readonly version: VersionArray) {
    const isValid = Version.isValidVersion(this.version);

    if (isValid !== true) {
      throw isValid;
    }
  }

  /** This checks if any type is a valid version "object" at runtime
   *
   * @param version the version toc heck
   */
  private static isValidVersion(version: Version | any): true | Error {
    if (!Array.isArray(version)) {
      return new Error("Version object is not an Array");
    }

    if (version.length !== 3) {
      return new Error(`Version array has ${version.length} entries, but expected 3`);
    }

    for (const index in version as VersionArray) {
      const num = version[index];
      if (!Number.isInteger(num)) {
        const name = versionNames[index];
        return new Error(`${name} version component is not a number: '${num}'`);
      }
    }

    return true;
  }

  /** This compares two versions
   *  - if the first one is bigger, a value > 0 is returned
   *  - if they are the same, 0 is returned
   *  - if the first one is smaller, a value < 0 is returned
   * @param version1
   * @param version2
   */
  private static compareImpl([major1, minor1, patch1]: VersionArray, [major2, minor2, patch2]: VersionArray): number {
    if (major1 !== major2) {
      return major1 - major2;
    }

    if (minor1 !== minor2) {
      return minor1 - minor2;
    }

    return patch1 - patch2;
  }

  compareWithOther(otherVersion: Version): number {
    return Version.compareImpl(this.version, otherVersion.version);
  }

  compare(otherVersion: VersionArray): number {
    return Version.compareImpl(this.version, otherVersion);
  }

  private static versionToString([major, minor, patch]: VersionArray): string {
    return `${major}.${minor}.${patch}`;
  }

  toString(): string {
    return Version.versionToString(this.version);
  }
}
