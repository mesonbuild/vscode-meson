import { MesonDebugConfigurationProvider } from ".";

export class DebugConfigurationProviderLldb extends MesonDebugConfigurationProvider {
  override type: string = "lldb";

  constructor(path: string) {
    super(path);
  }
}
