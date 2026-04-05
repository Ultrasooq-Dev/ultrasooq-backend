import 'reflect-metadata';

export const FILTERABLE_KEY = 'content-filter:filterable';

export function Filterable(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing: string[] = Reflect.getMetadata(FILTERABLE_KEY, target.constructor) || [];
    Reflect.defineMetadata(FILTERABLE_KEY, [...existing, String(propertyKey)], target.constructor);
  };
}

export function getFilterableFields(dto: object): string[] {
  return Reflect.getMetadata(FILTERABLE_KEY, dto.constructor) || [];
}
