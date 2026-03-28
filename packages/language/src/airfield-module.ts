import { type Module, inject } from 'langium';
import { 
    createDefaultModule, 
    createDefaultSharedModule, 
    type DefaultSharedModuleContext, 
    type LangiumServices, 
    type LangiumSharedServices, 
    type PartialLangiumServices
} from 'langium/lsp';
import { 
    ReferenceInfo, 
    Scope,
    DefaultScopeProvider,
    AstUtils
} from 'langium';
import { AirfieldGeneratedModule, AirfieldGeneratedSharedModule } from './generated/module.js';
import { AirfieldValidator, registerValidationChecks } from './airfield-validator.js';
import { AirfieldCodeActionProvider } from './airfield-code-actions.js';
import { AirfieldHoverProvider } from './hover-provider.js';
import { isModel, isAccessPath, isInduction } from './generated/ast.js';

export type AirfieldAddedServices = {
    validation: {
        AirfieldValidator: AirfieldValidator
    }
}

export type AirfieldServices = LangiumServices & AirfieldAddedServices

export const AirfieldModule: Module<AirfieldServices, PartialLangiumServices & AirfieldAddedServices> = {
    validation: {
        AirfieldValidator: () => new AirfieldValidator()
    },
    references: {
        ScopeProvider: (services) => new AirfieldScopeProvider(services)
    },
    lsp: {
        CodeActionProvider: () => new AirfieldCodeActionProvider(),
        HoverProvider: (services) => new AirfieldHoverProvider(services)
    }
};

export function createAirfieldServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices,
    Airfield: AirfieldServices
} {
    const shared = inject(
        createDefaultSharedModule(context),
        AirfieldGeneratedSharedModule
    );
    const Airfield = inject(
        createDefaultModule({ shared }),
        AirfieldGeneratedModule,
        AirfieldModule
    );
    shared.ServiceRegistry.register(Airfield);
    registerValidationChecks(Airfield);
    if (!context.connection) {
        // We don't run inside a language server
        // Therefore, initialize the configuration provider instantly
        shared.workspace.ConfigurationProvider.initialized({});
    }
    return { shared, Airfield };
}

class AirfieldScopeProvider extends DefaultScopeProvider {
    override getScope(context: ReferenceInfo): Scope {
        const model = AstUtils.getContainerOfType(context.container, isModel);
        if (!model) {
            return super.getScope(context);
        }

        if (context.property === 'bays') {
            const induction = context.container;
            if (isInduction(induction) && induction.hangar?.ref) {
                const hangar = induction.hangar.ref;
                const baysInHangar = hangar.grid.bays;
                const descriptions = baysInHangar.map(bay => 
                    this.descriptions.createDescription(bay, bay.name)
                );
                return this.createScope(descriptions);
            }
            
            // Fallback: all bays from all hangars
            const allBays = model.hangars.flatMap(h => h.grid.bays);
            const descriptions = allBays.map(bay => 
                this.descriptions.createDescription(bay, bay.name)
            );
            return this.createScope(descriptions);
        }

        if (context.property === 'door') {
            const induction = context.container;
            if (isInduction(induction) && induction.hangar?.ref) {
                const hangar = induction.hangar.ref;
                const descriptions = hangar.doors.map(door => 
                    this.descriptions.createDescription(door, door.name)
                );
                return this.createScope(descriptions);
            }
            
            // Fallback: all doors from all hangars
            const allDoors = model.hangars.flatMap(h => h.doors);
            const descriptions = allDoors.map(door => 
                this.descriptions.createDescription(door, door.name)
            );
            return this.createScope(descriptions);
        }

        if (context.property === 'accessNode') {
            const allNodes = model.accessPaths.flatMap(ap => ap.nodes);
            const descriptions = allNodes.map(node => 
                this.descriptions.createDescription(node, node.name)
            );
            return this.createScope(descriptions);
        }

        if (context.property === 'from' || context.property === 'to') {
            const accessPath = AstUtils.getContainerOfType(context.container, isAccessPath);
            if (accessPath) {
                const descriptions = accessPath.nodes.map(node => 
                    this.descriptions.createDescription(node, node.name)
                );
                return this.createScope(descriptions);
            }
        }

        if (context.property === 'precedingInductions') {
            const allInductions = [...model.inductions, ...model.autoInductions];
            const descriptions = allInductions
                .filter(ind => ind.id) // only inductions with an explicit id can be referenced by name
                .map(ind =>
                    this.descriptions.createDescription(ind, ind.id!)
                );
            return this.createScope(descriptions);
        }

        return super.getScope(context);
    }
}
