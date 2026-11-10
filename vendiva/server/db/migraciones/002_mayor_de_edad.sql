-- Vendiva es para personas de 18 años o más.
-- Al crear la cuenta la usuaria marca "Confirmo que tengo 18 años o más";
-- aquí queda escrito cuándo lo confirmó. (Las cuentas de prueba anteriores quedan en null.)

alter table usuarias add column mayor_de_edad_confirmada_en timestamptz;
