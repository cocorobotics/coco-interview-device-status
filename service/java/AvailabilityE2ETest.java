import com.rabbitmq.client.AMQP;
import com.rabbitmq.client.Channel;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@Tag("e2e")
class AvailabilityE2ETest {

    @BeforeEach
    void quietStack() throws Exception {
        Server.post(Server.FLEET_URL + "/v1/_debug/traffic", Map.of("enabled", false));
        Channel channel = Server.connect();
        channel.queuePurge(Server.QUEUE);
        channel.getConnection().close();
        // Lets a change your consumer already had in flight land before DeliverMe is cleared.
        Thread.sleep(2000);
        Server.post(Server.PARTNER_URL + "/v1/_debug/reset", null);
    }

    @AfterEach
    void resumeTraffic() throws Exception {
        Server.post(Server.FLEET_URL + "/v1/_debug/traffic", Map.of("enabled", true));
    }

    static void publishChange(String serial, String status, List<String> limitingFactors) throws Exception {
        Map<String, Object> change = Map.of(
                "serial", serial,
                "status", status,
                "limitingFactors", limitingFactors,
                "observedAt", Instant.now().truncatedTo(ChronoUnit.MILLIS).toString());
        AMQP.BasicProperties properties = new AMQP.BasicProperties.Builder()
                .messageId("chg_e2e_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12))
                .contentType("application/json")
                .build();

        Channel channel = Server.connect();
        channel.confirmSelect();
        channel.basicPublish("fleet", "device.status.changed", properties,
                Server.JSON.toJson(change).getBytes(StandardCharsets.UTF_8));
        channel.waitForConfirmsOrDie(5000);
        channel.getConnection().close();
    }

    // Null when DeliverMe has recorded nothing for the vehicle within the timeout.
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
    @DisplayName("given a robot online with nothing blocking it, when the fleet publishes that change, then DeliverMe shows it available")
    void onlineRobotWithNothingBlockingIsAvailable() throws Exception {
        publishChange("C10393", "ONLINE", List.of());

        assertEquals(Boolean.TRUE, availabilityOnceWritten("veh_8f21c4", 20_000));
    }
}
