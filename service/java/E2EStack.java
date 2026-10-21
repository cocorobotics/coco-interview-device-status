import com.rabbitmq.client.AMQP;
import com.rabbitmq.client.Channel;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class E2EStack {

    static void isolateTest() throws Exception {
        Server.post(Server.FLEET_URL + "/v1/_debug/traffic", Map.of("enabled", false));
        Channel channel = Server.connect();
        channel.queuePurge(Server.QUEUE);
        channel.getConnection().close();
        // Lets a change your consumer already had in flight land before HangryHippo is cleared.
        Thread.sleep(2000);
        Server.post(Server.PARTNER_URL + "/v1/_debug/reset", null);
    }

    static void resumeTraffic() throws Exception {
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

    static String getVehicleId(String serial) throws Exception {
        Server.Response res = Server.get(Server.FLEET_URL + "/v1/devices/" + serial + "/partner-accounts/hangry-hippo");
        if (res.status() != 200) {
            throw new AssertionError("Fleet has no HangryHippo vehicle for " + serial + ": status " + res.status());
        }
        return res.body().getAsJsonObject().get("vehicleId").getAsString();
    }

    // Null while HangryHippo has had nothing written for the vehicle.
    static Boolean getAvailability(String vehicleId) throws Exception {
        Server.Response res = Server.get(Server.PARTNER_URL + "/v1/vehicles/" + vehicleId + "/availability");
        return res.status() == 200 ? res.body().getAsJsonObject().get("available").getAsBoolean() : null;
    }
}
