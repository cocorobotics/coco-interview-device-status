from helpers import publish_change


def test_given_a_robot_online_with_nothing_blocking_it_when_fleet_publishes_that_change_then_the_publish_succeeds(isolated):
    publish_change("C10393", "ONLINE", [])
