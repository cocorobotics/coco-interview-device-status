import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;

@Tag("e2e")
class AvailabilityE2ETest {

    @BeforeEach
    void isolateTest() throws Exception {
        E2EStack.isolateTest();
    }

    @AfterEach
    void resumeTraffic() throws Exception {
        E2EStack.resumeTraffic();
    }

    @Test
    @DisplayName("given a robot online with nothing blocking it, when Fleet publishes that change, then the publish succeeds")
    void onlineRobotWithNothingBlockingIsPublished() throws Exception {
        E2EStack.publishChange("C10393", "ONLINE", List.of());
    }
}
