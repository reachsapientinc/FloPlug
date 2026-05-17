export interface FloKitDoc {
    id: string;
    name: string;
    description: string;
    connectorId: string;
    availableForTiers: string[];
    isActive: boolean;
    createdAt?: any;
    updatedAt?: any;
}
