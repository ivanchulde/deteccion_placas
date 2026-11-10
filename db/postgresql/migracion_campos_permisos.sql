-- Ampliación compatible: no elimina columnas, registros ni permisos existentes.
ALTER TABLE listablanca
  ADD COLUMN IF NOT EXISTS cedula varchar(10),
  ADD COLUMN IF NOT EXISTS institucion varchar(150),
  ADD COLUMN IF NOT EXISTS cargo varchar(150);
ALTER TABLE listablanca ALTER COLUMN placa DROP NOT NULL;
ALTER TABLE listanegra ALTER COLUMN placa DROP NOT NULL;
ALTER TABLE deteccionvehiculo ALTER COLUMN placa_validada DROP NOT NULL;
ALTER TABLE solicitudesacceso
  ADD COLUMN IF NOT EXISTS cedula varchar(10),
  ADD COLUMN IF NOT EXISTS institucion varchar(150),
  ADD COLUMN IF NOT EXISTS cargo varchar(150),
  ADD COLUMN IF NOT EXISTS observaciones varchar(255);
-- Los formularios y la validación del backend admiten tipos personalizados de hasta 50 caracteres.
ALTER TABLE deteccionvehiculo ALTER COLUMN vehiculo_tipo TYPE varchar(50);
