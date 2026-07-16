from stm_harness.examples import construct_user_examples


def row(card_id, elapsed_seconds, rating=3, state=1, duration=1_000):
    return {
        "card_id": card_id,
        "elapsed_seconds": elapsed_seconds,
        "rating": rating,
        "state": state,
        "duration": duration,
    }


def test_constructs_prior_only_features_and_chronological_suffix():
    rows, stats = construct_user_examples(
        7,
        [
            row(10, -1, rating=3),
            row(20, -1, rating=1),
            row(10, 0, rating=1),
            row(20, 60, rating=3),
            row(10, 600, rating=4),
            row(20, 604_801, rating=1),
        ],
        holdout_fraction=0.5,
        minimum_train_examples=1,
        minimum_holdout_examples=1,
    )

    first_prediction = rows[2]
    assert first_prediction["is_first_predictive_review"] is True
    assert first_prediction["previous_recalled"] is True
    assert first_prediction["prior_success_count"] == 1
    assert first_prediction["prior_failure_count"] == 0
    assert first_prediction["recalled"] is False
    assert [row["split"] for row in rows] == ["train", "train", "train", "train", "holdout", "holdout"]
    assert stats["train_predictive_examples"] == 2
    assert stats["holdout_predictive_examples"] == 2


def test_excludes_whole_cards_with_truncated_or_reseeded_history():
    rows, stats = construct_user_examples(
        9,
        [
            row(1, 10),
            row(2, -1),
            row(3, -1),
            row(2, 30),
            row(3, -1),
            row(2, 60),
        ],
        holdout_fraction=0.5,
        minimum_train_examples=1,
        minimum_holdout_examples=1,
    )

    assert {row["card_id"] for row in rows} == {2}
    assert [row["source_index"] for row in rows] == [1, 3, 5]
    assert stats["excluded_cards"] == 2


def test_rejects_invalid_source_values():
    try:
        construct_user_examples(
            1,
            [row(1, -1), row(1, 20, rating=5)],
            holdout_fraction=0.2,
            minimum_train_examples=1,
            minimum_holdout_examples=1,
        )
    except ValueError as error:
        assert "invalid source value" in str(error)
    else:
        raise AssertionError("invalid rating was accepted")
