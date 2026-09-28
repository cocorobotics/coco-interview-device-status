import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

@Tag("integration")
class DeliverMeIntegrationTest {

    @Test
    @DisplayName("given a robot registered with DeliverMe, when its serial is looked up, then DeliverMe returns its vehicle id")
    void registeredSerialMapsToVehicleId() throws Exception {
        Server.Response res = Server.get(Server.PARTNER_URL + "/v1/vehicles?serial=C10393");

        assertEquals(200, res.status());
        assertEquals("veh_8f21c4", res.string("vehicleId"));
    }
}
