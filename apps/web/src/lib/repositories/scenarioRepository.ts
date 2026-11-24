// src/lib/repositories/scenarioRepository.ts

export interface Scenario {
  id: string;
  name: string;
  year: string;
  scope1: number;
  scope2: number;
  scope3: number;
  createdAt: string;
}

export interface ScenarioRepository {
  list(): Promise<Scenario[]>;
  create(scenario: Omit<Scenario, 'id' | 'createdAt'>): Promise<Scenario>;
  update(id: string, updates: Partial<Scenario>): Promise<Scenario>;
  remove(id: string): Promise<void>;
}

// In-memory fake implementation for development/demo
class InMemoryScenarioRepository implements ScenarioRepository {
  private scenarios: Scenario[] = [];
  private nextId = 1;

  async list(): Promise<Scenario[]> {
    return [...this.scenarios];
  }

  async create(data: Omit<Scenario, 'id' | 'createdAt'>): Promise<Scenario> {
    const newScenario: Scenario = {
      ...data,
      id: String(this.nextId++),
      createdAt: new Date().toISOString(),
    };
    this.scenarios.push(newScenario);
    return newScenario;
  }

  async update(id: string, updates: Partial<Scenario>): Promise<Scenario> {
    const index = this.scenarios.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('Scenario not found');
    
    this.scenarios[index] = { ...this.scenarios[index], ...updates };
    return this.scenarios[index];
  }

  async remove(id: string): Promise<void> {
    this.scenarios = this.scenarios.filter((s) => s.id !== id);
  }
}

export const scenarioRepo = new InMemoryScenarioRepository();