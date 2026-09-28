import com.rabbitmq.client.AMQP;
import com.rabbitmq.client.Channel;
import com.rabbitmq.client.Delivery;
import com.rabbitmq.client.Envelope;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ServerTest {

    // A Channel that records acks and rejects every other call, so a test fails loudly if the handler uses more of it.
    static Channel recordingChannel(List<Long> acked) {
        return (Channel) Proxy.newProxyInstance(Channel.class.getClassLoader(), new Class<?>[]{Channel.class},
                (proxy, method, args) -> {
                    if (method.getName().equals("basicAck")) {
                        acked.add((Long) args[0]);
                        return null;
                    }
                    throw new UnsupportedOperationException("fake channel does not support " + method.getName());
                });
    }

    static Delivery delivery(String body, long deliveryTag) {
        Envelope envelope = new Envelope(deliveryTag, false, "fleet", "device.status.changed");
        AMQP.BasicProperties properties = new AMQP.BasicProperties.Builder().messageId("chg_test").build();
        return new Delivery(envelope, properties, body.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("given a well-formed status change, when it is handled, then the message is acked")
    void wellFormedChangeIsAcked() throws Exception {
        List<Long> acked = new ArrayList<>();

        Server.handleStatusChange(recordingChannel(acked), delivery(
                "{\"serial\":\"C10393\",\"status\":\"ONLINE\",\"limitingFactors\":[],\"observedAt\":\"2026-09-24T17:02:11.482Z\"}", 7));

        assertEquals(List.of(7L), acked);
    }
}
