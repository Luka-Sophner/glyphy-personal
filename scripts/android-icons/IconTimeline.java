package __PACKAGE__;

public final class IconTimeline {
    public static final int DEFAULT_FRAME = __DEFAULT_FRAME__;
    public static final int[] INACTIVE_FRAMES = { __INACTIVE_FRAMES__ };
    public static final long INITIAL_DELAY = 12 * 60 * 60 * 1000L;
    public static final long STEP = 2 * 60 * 60 * 1000L;

    private IconTimeline() {}

    public static int frame(long elapsed) {
        if (elapsed < INITIAL_DELAY) return DEFAULT_FRAME;
        int index = (int) (((elapsed - INITIAL_DELAY) / STEP) % INACTIVE_FRAMES.length);
        return INACTIVE_FRAMES[index];
    }

    public static long nextDelay(long elapsed) {
        if (elapsed < INITIAL_DELAY) return INITIAL_DELAY - Math.max(0, elapsed);
        return STEP - (elapsed - INITIAL_DELAY) % STEP;
    }
}
