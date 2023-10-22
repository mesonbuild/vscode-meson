import { MesonDebugConfigurationProvider } from ".";

export class DebugConfigurationProviderLldb extends MesonDebugConfigurationProvider {
  constructor(path: string) {
    super(path);
  }

  override getName(): string {
    return "lldb";
  }
}
