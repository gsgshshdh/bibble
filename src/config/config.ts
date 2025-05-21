import { 
  BibbleConfig, 
  defaultConfig, 
  loadConfig, 
  saveConfig, 
  getValueByPath, 
  setValueByPath 
} from "./storage.js";

/**
 * Config manager class for bibble
 */
export class Config {
  private static instance: Config;
  private config: BibbleConfig;

  private constructor() {
    // Load config on initialization
    this.config = loadConfig();
  }

  /**
   * Get the singleton instance of Config
   */
  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  /**
   * Get a configuration value
   * @param key The dot-notation key to get
   * @param defaultValue The default value if not found
   */
  public get<T>(key: string, defaultValue?: T): T {
    return getValueByPath<T>(this.config, key, defaultValue);
  }

  /**
   * Set a configuration value
   * @param key The dot-notation key to set
   * @param value The value to set
   */
  public set<T>(key: string, value: T): void {
    setValueByPath(this.config, key, value);
    saveConfig(this.config);
  }

  /**
   * Delete a configuration value
   * @param key The dot-notation key to delete
   */
  public delete(key: string): void {
    const keys = key.split(".");
    const lastKey = keys.pop();
    
    if (!lastKey) {
      return;
    }
    
    let current = this.config;
    
    for (const k of keys) {
      if (current[k] === undefined || current[k] === null) {
        return;
      }
      current = current[k];
    }
    
    delete current[lastKey];
    saveConfig(this.config);
  }

  /**
   * Get all configuration
   */
  public getAll(): BibbleConfig {
    return this.config;
  }

  /**
   * Set all configuration
   * @param configObj The configuration object to set
   */
  public setAll(configObj: BibbleConfig): void {
    this.config = configObj;
    saveConfig(this.config);
  }

  /**
   * Reset configuration to defaults
   */
  public reset(): void {
    this.config = { ...defaultConfig };
    saveConfig(this.config);
  }

  /**
   * Get API key for a provider
   * @param provider The provider name
   */
  public getApiKey(provider: string): string | undefined {
    return this.get(`apis.${provider}.apiKey`);
  }

  /**
   * Set API key for a provider
   * @param provider The provider name
   * @param apiKey The API key
   */
  public setApiKey(provider: string, apiKey: string): void {
    this.set(`apis.${provider}.apiKey`, apiKey);
  }

  /**
   * Get the default model ID
   */
  public getDefaultModel(): string {
    return this.get("apis.openai.defaultModel");
  }

  /**
   * Set the default model ID
   * @param modelId The model ID
   */
  public setDefaultModel(modelId: string): void {
    this.set("apis.openai.defaultModel", modelId);
  }

  /**
   * Get the system prompt
   */
  public getSystemPrompt(): string {
    return this.get("chat.systemPrompt");
  }

  /**
   * Set the system prompt
   * @param prompt The system prompt
   */
  public setSystemPrompt(prompt: string): void {
    this.set("chat.systemPrompt", prompt);
  }

  /**
   * Get the user guidelines
   */
  public getUserGuidelines(): string | undefined {
    return this.get("chat.userGuidelines");
  }

  /**
   * Set the user guidelines
   * @param guidelines The user guidelines
   */
  public setUserGuidelines(guidelines: string): void {
    this.set("chat.userGuidelines", guidelines);
  }

  /**
   * Get MCP server configurations
   */
  public getMcpServers(): BibbleConfig["mcpServers"] {
    return this.get("mcpServers", []);
  }

  /**
   * Add an MCP server configuration
   * @param server The server configuration
   */
  public addMcpServer(server: BibbleConfig["mcpServers"][0]): void {
    const servers = this.getMcpServers();
    servers.push(server);
    this.set("mcpServers", servers);
  }

  /**
   * Remove an MCP server configuration
   * @param serverName The server name to remove
   */
  public removeMcpServer(serverName: string): void {
    const servers = this.getMcpServers();
    const filteredServers = servers.filter(s => s.name !== serverName);
    this.set("mcpServers", filteredServers);
  }
}
