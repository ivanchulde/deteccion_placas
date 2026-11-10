-- La ficha del registro no altera su placa, vigencia ni condición de acceso.
-- ListaBlanca ya dispone de estos campos; se incorporan a ListaNegra sin perder datos.
ALTER TABLE listanegra
  ADD COLUMN IF NOT EXISTS institucion varchar(150),
  ADD COLUMN IF NOT EXISTS cargo varchar(150);
