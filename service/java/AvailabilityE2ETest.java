import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.rabbitmq.client.Channel;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

@Tag("e2e")
class AvailabilityE2ETest {

    @BeforeEach
    void quietStack() throws Exception {
        Server.post(Server.FLEET_URL + "/v1/_debug/traffic", Map.of("enabled", false));
        Channel channel = Server.connect();
        channel.queuePurge(Server.QUEUE);
        channel.getConnection().close();
        // Lets a change your consumer already had in flight land before HangryHippo is cleared.
        Thread.sleep(2000);
        Server.post(Server.PARTNER_URL + "/v1/_debug/reset", null);
    }

    @AfterEach
    void resumeTraffic() throws Exception {
        Server.post(Server.FLEET_URL + "/v1/_debug/traffic", Map.of("enabled", true));
    }

    static void publishChange(String serial, String status, List<String> limitingFactors) throws Exception {
        Server.Response res = Server.post(Server.FLEET_URL + "/v1/_debug/changes", Map.of(
                "serial", serial,
                "status", status,
                "limitingFactors", limitingFactors));
        assertEquals(200, res.status(), "fleet did not publish the change: " + res.body());
    }

    static List<JsonObject> hangryHippoCalls(String vehicleId) throws Exception {
        Server.Response res = Server.get(Server.PARTNER_URL + "/v1/_debug/calls");
        List<JsonObject> out = new ArrayList<>();
        for (JsonElement call : res.body().getAsJsonObject().getAsJsonArray("calls")) {
            if (call.getAsJsonObject().get("vehicleId").getAsString().equals(vehicleId)) {
                out.add(call.getAsJsonObject());
            }
        }
        return out;
    }

    // Null when HangryHippo has recorded nothing for the vehicle within the timeout.
    static Boolean availabilityOnceWritten(String vehicleId, long timeoutMs) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            Server.Response res = Server.get(Server.PARTNER_URL + "/v1/vehicles/" + vehicleId + "/availability");
            if (res.status() == 200) {
                return res.body().getAsJsonObject().get("available").getAsBoolean();
            }
            Thread.sleep(250);
        }
        return null;
    }

    @Test
    @DisplayName("given a robot online with nothing blocking it, when the fleet publishes that change, then HangryHippo shows it available")
    void onlineRobotWithNothingBlockingIsAvailable() throws Exception {
        publishChange("C10393", "ONLINE", List.of());

        assertEquals(Boolean.TRUE, availabilityOnceWritten("veh_8f21c4", 20_000));
    }
}
